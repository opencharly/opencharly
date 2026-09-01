/**
 * vision.ts — the umbrella's first-party vision extension.
 *
 * Why it exists: the umbrella's coding model (ollama-cloud/deepseek-v4-flash:0731)
 * is text-only — it cannot see images. This extension gives it vision two ways:
 *
 *   1. AUTOMATIC HANDOFF — every image that reaches the LLM-bound payload
 *      (pasted/attached images, `read`-tool results) is described by the
 *      configured vision model (ollama-cloud/qwen3.5:397b) and the description
 *      text is swapped in for the image block before the request leaves.
 *      Descriptions are batched (N images → ONE vision call) and cached per
 *      image hash, so the swap is instant by the time the model needs it.
 *   2. `vision_ask` TOOL — the coding model can explicitly ask the vision
 *      model questions about a picture on demand (beyond the automatic
 *      handoff), e.g. "what color is the circle in /tmp/x.png?".
 *
 * The vision model is configured in the committed project-local config
 * `.pi/vision.json` (visionModel: "ollama-cloud/qwen3.5:397b") — no user-level
 * config, no third-party package. The coding model is NEVER changed by this
 * extension; it only describes images for it.
 *
 * Pipeline (informed by the MIT-licensed pi-vision reference, implemented
 * fresh and lean):
 *   before_agent_start → prewarm the description cache for attached images and
 *     pasted image temp-file paths found in the prompt.
 *   tool_result (read) → describe read-tool images during the tool-result
 *     phase (free time) and strip pi's "model does not support images" note.
 *   context → swap any remaining image blocks for their (now cached) text
 *     description on the LLM-bound payload, before pi-ai strips them.
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Api, AssistantMessage, Context, ImageContent, Model, SimpleStreamOptions, TextContent } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// --- Constants ---

const UNAVAILABLE = "[Image: description unavailable]";
const NON_VISION_IMAGE_NOTE =
	"[Current model does not support images. The image will be omitted from this request.]";
const DEFAULT_VISION_PROMPT =
	"You are an image describer. Describe the image(s) exhaustively and accurately: layout, colors, text, UI elements, diagrams, and anything else a text-only model needs to understand the picture. Be precise and complete.";
const DEFAULT_USER_PROMPT_PREFIX = "The user's request about this image: ";
const BASE_TIMEOUT_MS = 60_000;
const PER_IMAGE_TIMEOUT_MS = 30_000;

interface VisionConfig {
	enabled: boolean;
	visionModel: string | null;
	autoHandoff: boolean;
	handoffModels: string[];
	cacheMax: number;
	maxDescriptionLines: number;
	maxTokens: number | null;
	prompt: string;
	userPromptPrefix: string;
}

const DEFAULT_CONFIG: VisionConfig = {
	enabled: true,
	visionModel: "ollama-cloud/qwen3.5:397b",
	autoHandoff: true,
	handoffModels: [],
	cacheMax: 50,
	maxDescriptionLines: 0,
	maxTokens: null,
	prompt: DEFAULT_VISION_PROMPT,
	userPromptPrefix: DEFAULT_USER_PROMPT_PREFIX,
};

// --- Config (project-local, committed: .pi/vision.json) ---

function projectRoot(): string {
	try {
		const here = fileURLToPath(new URL(".", import.meta.url)); // <root>/.pi/extensions/
		return resolve(here, "..", "..");
	} catch {
		return process.cwd();
	}
}

function configPath(): string {
	return join(projectRoot(), ".pi", "vision.json");
}

function parseModelRef(ref: string): { provider: string; id: string } | null {
	const trimmed = ref.trim();
	const slash = trimmed.indexOf("/");
	if (slash <= 0) return null;
	const provider = trimmed.slice(0, slash);
	const id = trimmed.slice(slash + 1);
	if (!provider || !id) return null;
	return { provider, id };
}

function normalizeConfig(raw: unknown): VisionConfig {
	const base: VisionConfig = { ...DEFAULT_CONFIG };
	if (!raw || typeof raw !== "object") return base;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.enabled === "boolean") base.enabled = obj.enabled;
	if (typeof obj.visionModel === "string" && obj.visionModel.trim() && parseModelRef(obj.visionModel)) {
		base.visionModel = obj.visionModel.trim();
	}
	if (Array.isArray(obj.handoffModels)) {
		base.handoffModels = obj.handoffModels.filter(
			(m): m is string => typeof m === "string" && !!parseModelRef(m),
		);
	}
	if (typeof obj.autoHandoff === "boolean") base.autoHandoff = obj.autoHandoff;
	if (typeof obj.cacheMax === "number" && Number.isFinite(obj.cacheMax) && obj.cacheMax > 0) {
		base.cacheMax = Math.floor(obj.cacheMax);
	}
	if (
		typeof obj.maxDescriptionLines === "number" &&
		Number.isFinite(obj.maxDescriptionLines) &&
		obj.maxDescriptionLines >= 0
	) {
		base.maxDescriptionLines = Math.floor(obj.maxDescriptionLines);
	}
	if (typeof obj.maxTokens === "number" && Number.isFinite(obj.maxTokens) && obj.maxTokens > 0) {
		base.maxTokens = Math.floor(obj.maxTokens);
	}
	if (typeof obj.prompt === "string" && obj.prompt.trim()) base.prompt = obj.prompt;
	if (typeof obj.userPromptPrefix === "string") base.userPromptPrefix = obj.userPromptPrefix;
	return base;
}

function readConfig(): VisionConfig {
	try {
		if (existsSync(configPath())) {
			return normalizeConfig(JSON.parse(readFileSync(configPath(), "utf8")));
		}
	} catch {
		// fall through to defaults
	}
	return { ...DEFAULT_CONFIG };
}

function writeConfig(config: VisionConfig): void {
	try {
		mkdirSync(join(projectRoot(), ".pi"), { recursive: true });
		writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
	} catch {
		// best-effort
	}
}

// --- Image utilities ---

interface ExtractedImage {
	data: string;
	mimeType: string;
}

function parseDataUrl(url: string): ExtractedImage | null {
	const m = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(url);
	if (!m) return null;
	return { mimeType: m[1] || "image/png", data: m[2] };
}

function extractImageFromBlock(block: unknown): ExtractedImage | null {
	if (!block || typeof block !== "object") return null;
	const b = block as Record<string, unknown>;
	// pi-ai internal: { type: "image", data, mimeType }
	if (b.type === "image" && typeof b.data === "string" && typeof b.mimeType === "string") {
		return { data: b.data, mimeType: b.mimeType };
	}
	// OpenAI Chat Completions: { type: "image_url", image_url: { url } }
	if (b.type === "image_url" && b.image_url && typeof (b.image_url as Record<string, unknown>).url === "string") {
		const parsed = parseDataUrl((b.image_url as Record<string, unknown>).url as string);
		if (parsed) return parsed;
	}
	// OpenAI Responses: { type: "input_image", image_url: "data:..." }
	if (b.type === "input_image" && typeof b.image_url === "string") {
		const parsed = parseDataUrl(b.image_url);
		if (parsed) return parsed;
	}
	// Anthropic Messages: { type: "image", source: { type: "base64", media_type, data } }
	if (b.type === "image" && b.source && typeof b.source === "object") {
		const src = b.source as Record<string, unknown>;
		if (src.type === "base64" && typeof src.data === "string" && typeof src.media_type === "string") {
			return { data: src.data, mimeType: src.media_type };
		}
	}
	return null;
}

function imageHash(mimeType: string, data: string): string {
	return createHash("sha256")
		.update(mimeType + data)
		.digest("hex")
		.slice(0, 32);
}

function mimeFromPath(p: string): string {
	const ext = p.split(".").pop()?.toLowerCase() ?? "";
	switch (ext) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		case "bmp":
			return "image/bmp";
		default:
			return "image/png";
	}
}

function readImageFile(pathOrUrl: string): ExtractedImage | null {
	if (pathOrUrl.startsWith("data:")) return parseDataUrl(pathOrUrl);
	try {
		if (!existsSync(pathOrUrl)) return null;
		const buf = readFileSync(pathOrUrl);
		return { data: buf.toString("base64"), mimeType: mimeFromPath(pathOrUrl) };
	} catch {
		return null;
	}
}

function findPastedImagePaths(prompt: string): string[] {
	const out: string[] = [];
	const tmp = tmpdir();
	const re = /[\w./-]+\.(png|jpe?g|gif|webp|bmp)/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(prompt))) {
		const p = m[0];
		if (isAbsolute(p) && p.startsWith(tmp)) out.push(p);
	}
	return [...new Set(out)];
}

// --- LRU cache ---

class LRUCache {
	private map = new Map<string, string>();
	constructor(private max: number) {}
	get(key: string): string | undefined {
		const v = this.map.get(key);
		if (v !== undefined) {
			this.map.delete(key);
			this.map.set(key, v);
		}
		return v;
	}
	set(key: string, value: string): void {
		this.map.delete(key);
		this.map.set(key, value);
		while (this.map.size > this.max) {
			const first = this.map.keys().next().value;
			if (first === undefined) break;
			this.map.delete(first);
		}
	}
}

// --- Error log ---

function appendError(entry: Record<string, unknown>): void {
	try {
		const dir = join(homedir(), ".pi", "agent", "logs", "vision");
		mkdirSync(dir, { recursive: true });
		appendFileSync(join(dir, "errors.log"), `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, "utf8");
	} catch {
		// best-effort
	}
}

// --- Describer ---

/** Complete through the provider registered in pi's model registry when one
 *  supplies a custom stream. The post-0.80 ModelRuntime keeps extension
 *  streams out of pi-ai's deprecated global compatibility registry, so
 *  calling completeSimple() directly cannot resolve custom providers such as
 *  ollama-cloud. The registry path is used when available; completeSimple is
 *  the fallback for built-in providers. */
async function completeVisionModel(
	model: Model<Api>,
	registry: ModelRegistry,
	context: Context,
	options: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const provider = registry.getRegisteredProviderConfig?.(model.provider);
	if (provider?.streamSimple && provider.api === model.api) {
		return provider.streamSimple(model, context, options).result();
	}
	return completeSimple(model, context, options);
}

function batchPrompt(count: number, userPrompt: string, prefix: string): string {
	return `${prefix}${userPrompt}\n\nDescribe each of the ${count} image(s) below. For each image, output a section starting with "<<<IMAGE k>>>" (k = the image's 0-based index) and ending with "<<<END>>>". Be exhaustive.`;
}

function parseBatched(text: string, count: number): (string | null)[] | null {
	const sections: (string | null)[] = new Array(count).fill(null);
	const re = /<<<IMAGE (\d+)>>>([\s\S]*?)<<<END>>>/g;
	let m: RegExpExecArray | null;
	let found = 0;
	while ((m = re.exec(text))) {
		const idx = parseInt(m[1], 10);
		if (idx >= 0 && idx < count) {
			sections[idx] = m[2].trim();
			found++;
		}
	}
	return found > 0 ? sections : null;
}

function capLines(text: string, max: number): string {
	if (max <= 0) return text;
	const lines = text.split("\n");
	return lines.length > max ? lines.slice(0, max).join("\n") + "\n[... description truncated …]" : text;
}

async function describeImages(
	imgs: ExtractedImage[],
	userPrompt: string,
	model: Model<Api>,
	registry: ModelRegistry,
	cfg: VisionConfig,
	signal?: AbortSignal,
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	const auth = await registry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) {
		appendError({ phase: "batch", reason: auth.error ?? "no API key", visionModel: cfg.visionModel, imageCount: imgs.length });
		return out;
	}
	const content: (TextContent | ImageContent)[] = [
		{ type: "text", text: batchPrompt(imgs.length, userPrompt, cfg.userPromptPrefix) },
		...imgs.map((img) => ({ type: "image", data: img.data, mimeType: img.mimeType }) as ImageContent),
	];
	const userMessage = { role: "user", content, timestamp: Date.now() };
	const timeoutMs = BASE_TIMEOUT_MS + PER_IMAGE_TIMEOUT_MS * (imgs.length - 1);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort, { once: true });
	try {
		const response = await completeVisionModel(
			model,
			registry,
			{ systemPrompt: cfg.prompt, messages: [userMessage] },
			{ apiKey: auth.apiKey, headers: auth.headers, signal: controller.signal, maxTokens: cfg.maxTokens ?? undefined },
		);
		if (response.stopReason === "aborted" || response.stopReason === "error") {
			appendError({ phase: "batch", reason: response.errorMessage ?? response.stopReason, visionModel: cfg.visionModel, imageCount: imgs.length });
			return out;
		}
		const text = response.content
			.filter((c): c is TextContent => c.type === "text")
			.map((c) => c.text)
			.join("\n")
			.trim();
		if (!text) {
			appendError({ phase: "batch", reason: "vision model returned an empty description", visionModel: cfg.visionModel, imageCount: imgs.length });
			return out;
		}
		const parsed = parseBatched(text, imgs.length);
		if (parsed) {
			for (let i = 0; i < imgs.length; i++) {
				const desc = parsed[i];
				if (desc) out.set(imageHash(imgs[i].mimeType, imgs[i].data), capLines(desc, cfg.maxDescriptionLines));
			}
			return out;
		}
		// Batch couldn't be split — fall back to parallel single-image calls.
		const singles = await Promise.all(
			imgs.map(async (img) => {
				const desc = await describeSingle(img, userPrompt, model, registry, cfg, signal);
				return desc ? ([img, desc] as const) : null;
			}),
		);
		for (const hit of singles) {
			if (hit) out.set(imageHash(hit[0].mimeType, hit[0].data), hit[1]);
		}
		return out;
	} catch (e) {
		appendError({ phase: "batch", reason: (e as Error).message, visionModel: cfg.visionModel, imageCount: imgs.length });
		return out;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}

async function describeSingle(
	img: ExtractedImage,
	userPrompt: string,
	model: Model<Api>,
	registry: ModelRegistry,
	cfg: VisionConfig,
	signal?: AbortSignal,
): Promise<string | null> {
	const auth = await registry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return null;
	const content: (TextContent | ImageContent)[] = [
		{ type: "text", text: `${cfg.userPromptPrefix}${userPrompt}` },
		{ type: "image", data: img.data, mimeType: img.mimeType },
	];
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), BASE_TIMEOUT_MS);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort, { once: true });
	try {
		const response = await completeVisionModel(
			model,
			registry,
			{ systemPrompt: cfg.prompt, messages: [{ role: "user", content, timestamp: Date.now() }] },
			{ apiKey: auth.apiKey, headers: auth.headers, signal: controller.signal, maxTokens: cfg.maxTokens ?? undefined },
		);
		if (response.stopReason === "aborted" || response.stopReason === "error") return null;
		const text = response.content
			.filter((c): c is TextContent => c.type === "text")
			.map((c) => c.text)
			.join("\n")
			.trim();
		return text ? capLines(text, cfg.maxDescriptionLines) : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}

// --- DataLoader ---

interface LoaderDeps {
	getConfig(): VisionConfig;
	getRegistry(): ModelRegistry | null;
	resolveVisionModel(registry: ModelRegistry, ref: string): Model<Api> | null;
}

class DescriptionLoader {
	private batch: { img: ExtractedImage; hash: string; resolve: (desc: string) => void }[] = [];
	private pending = new Map<string, Promise<string>>();
	private dispatchScheduled = false;
	private cache: LRUCache;
	private userPrompt = "";
	private signal: AbortSignal | undefined;

	constructor(private deps: LoaderDeps) {
		this.cache = new LRUCache(deps.getConfig().cacheMax);
	}

	bindTurnContext(userPrompt: string, signal?: AbortSignal): void {
		this.userPrompt = userPrompt;
		this.signal = signal;
	}

	setTurnSignal(signal?: AbortSignal): void {
		this.signal = signal;
	}

	resolveVisionModel(registry: ModelRegistry, ref: string): Model<Api> | null {
		return this.deps.resolveVisionModel(registry, ref);
	}

	loadDescription(img: ExtractedImage): Promise<string> {
		const hash = imageHash(img.mimeType, img.data);
		const cached = this.cache.get(hash);
		if (cached !== undefined) return Promise.resolve(cached);
		const existing = this.pending.get(hash);
		if (existing) return existing;
		const promise = new Promise<string>((resolvePromise) => {
			this.batch.push({ img, hash, resolve: resolvePromise });
			this.scheduleDispatch();
		});
		this.pending.set(hash, promise);
		return promise;
	}

	private scheduleDispatch(): void {
		if (this.dispatchScheduled) return;
		this.dispatchScheduled = true;
		setImmediate(() => {
			this.dispatchScheduled = false;
			void this.dispatch();
		});
	}

	private async dispatch(): Promise<void> {
		const batch = this.batch;
		this.batch = [];
		if (batch.length === 0) return;
		const cfg = this.deps.getConfig();
		const registry = this.deps.getRegistry();
		const model = registry ? this.deps.resolveVisionModel(registry, cfg.visionModel ?? "") : null;
		if (!model) {
			for (const b of batch) {
				b.resolve(UNAVAILABLE);
				this.pending.delete(b.hash);
			}
			return;
		}
		const results = await describeImages(
			batch.map((b) => b.img),
			this.userPrompt,
			model,
			registry,
			cfg,
			this.signal,
		);
		for (const b of batch) {
			const desc = results.get(b.hash);
			if (desc !== undefined) {
				this.cache.set(b.hash, desc);
				b.resolve(desc);
			} else {
				b.resolve(UNAVAILABLE); // failures are never cached
			}
			this.pending.delete(b.hash);
		}
	}
}

// --- Extension ---

export default function (pi: ExtensionAPI): void {
	let config = readConfig();
	let registry: ModelRegistry | null = null;
	let currentModel: { provider?: string; id?: string; input?: ("text" | "image")[] } | null = null;
	const warned = new Set<string>();

	const loader = new DescriptionLoader({
		getConfig: () => config,
		getRegistry: () => registry,
		resolveVisionModel: (reg, ref) => {
			const parsed = parseModelRef(ref);
			if (!parsed) return null;
			return reg.find(parsed.provider, parsed.id) ?? null;
		},
	});

	const isConfigured = (): boolean => config.enabled && !!config.visionModel;

	const isHandoffTarget = (
		model: { provider?: string; id?: string; input?: ("text" | "image")[] } | null | undefined,
	): boolean => {
		if (!model || !model.provider || !model.id) return false;
		const ref = `${model.provider}/${model.id}`;
		if (config.handoffModels.includes(ref)) return true;
		if (!config.autoHandoff) return false;
		return !isVisionModel(model);
	};

	const isVisionModel = (model: { input?: ("text" | "image")[] } | null | undefined): boolean =>
		!!model && Array.isArray(model.input) && model.input.includes("image");

	const warnOnce = (ctx: { ui?: { notify?: (msg: string, level?: string) => void } }, hash: string, msg: string): void => {
		if (warned.has(hash)) return;
		warned.add(hash);
		try {
			ctx.ui?.notify?.(`vision: ${msg}`, "warning");
		} catch {
			// no UI in headless mode
		}
	};

	// Log the resolved config at load (stderr, so headless stdout stays clean).
	console.error(
		`[vision] config: enabled=${config.enabled} visionModel=${config.visionModel ?? "(none)"} autoHandoff=${config.autoHandoff} cacheMax=${config.cacheMax}`,
	);

	pi.on("session_start", (_event, ctx) => {
		registry = ctx.modelRegistry;
	});

	pi.on("model_select", (event) => {
		currentModel = event.model;
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!isConfigured()) return;
		registry = ctx.modelRegistry;
		loader.bindTurnContext(event.prompt ?? "", ctx.signal);
		// Prewarm attached image blocks.
		if (Array.isArray(event.images)) {
			for (const img of event.images) {
				if (typeof img === "string") {
					const extracted = readImageFile(img);
					if (extracted) loader.loadDescription(extracted);
				} else {
					const extracted = extractImageFromBlock(img);
					if (extracted) loader.loadDescription(extracted);
				}
			}
		}
		// Prewarm pasted image temp-file paths in the prompt.
		for (const p of findPastedImagePaths(event.prompt ?? "")) {
			const img = readImageFile(p);
			if (img) loader.loadDescription(img);
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!isConfigured()) return;
		if (event.toolName !== "read") return;
		const model = currentModel ?? ctx.model;
		if (!isHandoffTarget(model)) return;
		registry = ctx.modelRegistry;
		const content = event.content;
		if (!Array.isArray(content)) return;
		const imgs: ExtractedImage[] = [];
		for (const block of content) {
			const img = extractImageFromBlock(block);
			if (img) imgs.push(img);
		}
		if (imgs.length === 0) return;
		loader.setTurnSignal(ctx.signal);
		await Promise.all(imgs.map((img) => loader.loadDescription(img)));
		// Strip pi's "model does not support images" note; keep image blocks for
		// kitty inline rendering and /resume (the context hook swaps them).
		let changed = false;
		const next = content.slice();
		for (let i = 0; i < next.length; i++) {
			const block = next[i];
			if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
				const text = (block as { text?: string }).text;
				if (typeof text === "string" && text.includes(NON_VISION_IMAGE_NOTE)) {
					next[i] = { type: "text", text: text.replace(NON_VISION_IMAGE_NOTE, "").trim() };
					changed = true;
				}
			}
		}
		if (changed) return { content: next };
	});

	pi.on("context", async (event, ctx) => {
		if (!isConfigured()) return;
		registry = ctx.modelRegistry;
		const messages = event.messages as unknown as Array<Record<string, unknown>>;
		if (!Array.isArray(messages)) return;
		const byHash = new Map<string, ExtractedImage>();
		let anyImage = false;
		for (const msg of messages) {
			const content = msg.content;
			if (!Array.isArray(content)) continue;
			for (const block of content) {
				const img = extractImageFromBlock(block);
				if (img) {
					anyImage = true;
					byHash.set(imageHash(img.mimeType, img.data), img);
				}
			}
		}
		if (!anyImage) return;
		const model = currentModel ?? ctx.model;
		if (!isHandoffTarget(model)) return;
		loader.setTurnSignal(ctx.signal);
		const imgs = [...byHash.values()];
		const descArr = await Promise.all(imgs.map((img) => loader.loadDescription(img)));
		if (ctx.signal?.aborted) return;
		const descs = new Map<string, string>();
		for (let i = 0; i < imgs.length; i++) {
			const hash = imageHash(imgs[i].mimeType, imgs[i].data);
			const desc = descArr[i];
			if (desc === UNAVAILABLE) warnOnce(ctx, hash, `image description failed for ${hash.slice(0, 8)}`);
			descs.set(hash, desc);
		}
		let changed = false;
		for (const msg of messages) {
			const content = msg.content;
			if (!Array.isArray(content)) continue;
			const next: unknown[] = [];
			let touched = false;
			for (const block of content) {
				const img = extractImageFromBlock(block);
				if (img) {
					next.push({ type: "text", text: descs.get(imageHash(img.mimeType, img.data)) ?? UNAVAILABLE });
					touched = true;
				} else {
					next.push(block);
				}
			}
			if (touched) {
				msg.content = next;
				changed = true;
			}
		}
		if (changed) return { messages: event.messages };
	});

	// vision_ask — the on-demand Q&A tool.
	pi.registerTool({
		name: "vision_ask",
		label: "Vision ask",
		description: `Ask the vision model (${config.visionModel ?? "not configured"}) a question about an image file. Use when you need visual details of a picture (colors, text, layout, UI elements, diagrams). Pass the image path and the question.`,
		parameters: Type.Object({
			image: Type.String({ description: "Path to an image file (also accepts a data: URL)" }),
			question: Type.String({ description: "The question to ask about the image" }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!isConfigured()) {
				return {
					content: [{ type: "text", text: "vision_ask failed: vision extension is disabled or no vision model configured" }],
					details: {},
				};
			}
			registry = ctx.modelRegistry;
			const model = registry ? loader.resolveVisionModel(registry, config.visionModel!) : null;
			if (!model) {
				return {
					content: [{ type: "text", text: `vision_ask failed: vision model ${config.visionModel} not found in the model registry` }],
					details: {},
				};
			}
			const img = readImageFile(params.image);
			if (!img) {
				return {
					content: [{ type: "text", text: `vision_ask failed: could not read image at ${params.image}` }],
					details: {},
				};
			}
			const desc = await describeSingle(img, params.question, model, registry, config, signal);
			if (!desc) {
				appendError({ phase: "tool", reason: "vision model returned no answer", visionModel: config.visionModel, image: params.image });
				return {
					content: [{ type: "text", text: "vision_ask failed: vision model returned no answer" }],
					details: {},
				};
			}
			return { content: [{ type: "text", text: desc }], details: {} };
		},
	});

	// /vision commands.
	pi.registerCommand("vision", {
		description: "Vision extension: status / model",
		async handler(args, ctx) {
			const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const sub = parts[0];
			if (sub === "status") {
				const active = isConfigured() && isHandoffTarget(currentModel);
				ctx.ui.notify(
					`vision: ${config.enabled ? "enabled" : "disabled"}, model=${config.visionModel ?? "(none)"}, handoff=${active ? "active" : "inactive"}`,
					"info",
				);
			} else if (sub === "model" && parts[1]) {
				const ref = parts[1];
				if (!parseModelRef(ref)) {
					ctx.ui.notify(`vision: invalid model ref "${ref}" (expected provider/id)`, "error");
					return;
				}
				config = { ...config, visionModel: ref };
				writeConfig(config);
				ctx.ui.notify(`vision: model set to ${ref}`, "info");
			} else {
				ctx.ui.notify("vision: usage — /vision status | /vision model <provider/id>", "info");
			}
		},
	});
}
