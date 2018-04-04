
import { mat4 } from 'gl-matrix';
import { assert, align } from './util';
import ArrayBufferSlice from 'ArrayBufferSlice';

export enum CompareMode {
    NEVER   = WebGLRenderingContext.NEVER,
    LESS    = WebGLRenderingContext.LESS,
    EQUAL   = WebGLRenderingContext.EQUAL,
    LEQUAL  = WebGLRenderingContext.LEQUAL,
    GREATER = WebGLRenderingContext.GREATER,
    NEQUAL  = WebGLRenderingContext.NOTEQUAL,
    GEQUAL  = WebGLRenderingContext.GEQUAL,
    ALWAYS  = WebGLRenderingContext.ALWAYS,
}

export enum FrontFaceMode {
    CCW = WebGLRenderingContext.CCW,
    CW  = WebGLRenderingContext.CW,
}

export enum CullMode {
    NONE,
    FRONT,
    BACK,
    FRONT_AND_BACK,
}

export enum BlendFactor {
    ZERO                = WebGLRenderingContext.ZERO,
    ONE                 = WebGLRenderingContext.ONE,
    SRC_COLOR           = WebGLRenderingContext.SRC_COLOR,
    ONE_MINUS_SRC_COLOR = WebGLRenderingContext.ONE_MINUS_SRC_COLOR,
    DST_COLOR           = WebGLRenderingContext.DST_COLOR,
    ONE_MINUS_DST_COLOR = WebGLRenderingContext.ONE_MINUS_DST_COLOR,
    SRC_ALPHA           = WebGLRenderingContext.SRC_ALPHA,
    ONE_MINUS_SRC_ALPHA = WebGLRenderingContext.ONE_MINUS_SRC_ALPHA,
    DST_ALPHA           = WebGLRenderingContext.DST_ALPHA,
    ONE_MINUS_DST_ALPHA = WebGLRenderingContext.ONE_MINUS_DST_ALPHA,
}

export enum BlendMode {
    NONE             = 0,
    ADD              = WebGLRenderingContext.FUNC_ADD,
    SUBTRACT         = WebGLRenderingContext.FUNC_SUBTRACT,
    REVERSE_SUBTRACT = WebGLRenderingContext.FUNC_REVERSE_SUBTRACT,
}

export class RenderFlags {
    public depthWrite: boolean = undefined;
    public depthTest: boolean = undefined;
    public depthFunc: CompareMode = undefined;
    public blendSrc: BlendFactor = undefined;
    public blendDst: BlendFactor = undefined;
    public blendMode: BlendMode = undefined;
    public cullMode: CullMode = undefined;
    public frontFace: FrontFaceMode = undefined;

    static default: RenderFlags = new RenderFlags();

    static flatten(dst: RenderFlags, src: RenderFlags) {
        if (dst.depthWrite === undefined)
            dst.depthWrite = src.depthWrite;
        if (dst.depthTest === undefined)
            dst.depthTest = src.depthTest;
        if (dst.depthFunc === undefined)
            dst.depthFunc = src.depthFunc;
        if (dst.blendMode === undefined)
            dst.blendMode = src.blendMode;
        if (dst.blendSrc === undefined)
            dst.blendSrc = src.blendSrc;
        if (dst.blendDst === undefined)
            dst.blendDst = src.blendDst;
        if (dst.cullMode === undefined)
            dst.cullMode = src.cullMode;
        if (dst.frontFace === undefined)
            dst.frontFace = src.frontFace;
    }

    static apply(gl: WebGL2RenderingContext, oldFlags: RenderFlags, newFlags: RenderFlags) {
        if (oldFlags.depthWrite !== newFlags.depthWrite) {
            gl.depthMask(newFlags.depthWrite);
        }

        if (oldFlags.depthTest !== newFlags.depthTest) {
            if (newFlags.depthTest)
                gl.enable(gl.DEPTH_TEST);
            else
                gl.disable(gl.DEPTH_TEST);
        }

        if (oldFlags.blendMode !== newFlags.blendMode) {
            if (newFlags.blendMode !== BlendMode.NONE) {
                gl.enable(gl.BLEND);
                gl.blendEquation(newFlags.blendMode);
            } else {
                gl.disable(gl.BLEND);
            }
        }

        if (oldFlags.blendSrc !== newFlags.blendSrc || oldFlags.blendDst !== newFlags.blendDst) {
            gl.blendFunc(newFlags.blendSrc, newFlags.blendDst);
        }

        if (oldFlags.depthFunc !== newFlags.depthFunc) {
            gl.depthFunc(newFlags.depthFunc);
        }

        if (oldFlags.cullMode !== newFlags.cullMode) {
            if (oldFlags.cullMode === CullMode.NONE)
                gl.enable(gl.CULL_FACE);
            else if (newFlags.cullMode === CullMode.NONE)
                gl.disable(gl.CULL_FACE);

            if (newFlags.cullMode === CullMode.BACK)
                gl.cullFace(gl.BACK);
            else if (newFlags.cullMode === CullMode.FRONT)
                gl.cullFace(gl.FRONT);
            else if (newFlags.cullMode === CullMode.FRONT_AND_BACK)
                gl.cullFace(gl.FRONT_AND_BACK);
        }

        if (oldFlags.frontFace !== newFlags.frontFace) {
            gl.frontFace(newFlags.frontFace);
        }
    }
}

RenderFlags.default.blendMode = BlendMode.NONE;
RenderFlags.default.blendSrc = BlendFactor.SRC_ALPHA;
RenderFlags.default.blendDst = BlendFactor.ONE_MINUS_SRC_ALPHA;
RenderFlags.default.cullMode = CullMode.NONE;
RenderFlags.default.depthTest = false;
RenderFlags.default.depthWrite = true;
RenderFlags.default.depthFunc = CompareMode.LEQUAL;
RenderFlags.default.frontFace = FrontFaceMode.CCW;

export class RenderTarget {
    public width: number;
    public height: number;

    public msaaFramebuffer: WebGLFramebuffer;
    public msaaColorRenderbuffer: WebGLRenderbuffer;
    public msaaDepthRenderbuffer: WebGLRenderbuffer;

    // Used for the actual resolve.
    public resolvedFramebuffer: WebGLFramebuffer;
    public resolvedColorTexture: WebGLTexture;

    public destroy(gl: WebGL2RenderingContext) {
        if (this.msaaFramebuffer)
            gl.deleteFramebuffer(this.msaaFramebuffer);
        if (this.msaaColorRenderbuffer)
            gl.deleteRenderbuffer(this.msaaColorRenderbuffer);
        if (this.msaaDepthRenderbuffer)
            gl.deleteRenderbuffer(this.msaaDepthRenderbuffer);
        if (this.resolvedFramebuffer)
            gl.deleteFramebuffer(this.resolvedFramebuffer);
        if (this.resolvedColorTexture)
            gl.deleteTexture(this.resolvedColorTexture);
    }

    public setParameters(gl: WebGL2RenderingContext, width: number, height: number) {
        if (this.width === width && this.height === height)
            return;

        this.destroy(gl);

        this.width = width;
        this.height = height;

        gl.getExtension('EXT_color_buffer_float');

        // XXX(jstpierre): Configurable?
        const samples = gl.getParameter(gl.SAMPLES);

        // MSAA FB.
        this.msaaColorRenderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaColorRenderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, this.width, this.height);
        this.msaaDepthRenderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaDepthRenderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT16, this.width, this.height);
        this.msaaFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.msaaFramebuffer);
        gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msaaColorRenderbuffer);
        gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.msaaDepthRenderbuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

        // Resolved.
        this.resolvedColorTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.resolvedColorTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.width, this.height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.resolvedFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolvedFramebuffer);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.resolvedColorTexture, 0);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    public resolve(gl: WebGL2RenderingContext) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolvedFramebuffer);
        gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    }
}


export class RenderState {
    private programCache: ProgramCache;

    // State.
    public currentProgram: Program = null;
    public currentFlags: RenderFlags = new RenderFlags();
    public currentRenderTarget: RenderTarget = null;

    // Parameters.
    public fov: number;
    public time: number;

    public projection: mat4;
    public view: mat4;

    public nearClipPlane: number;
    public farClipPlane: number;

    private scratchMatrix: mat4;

    public drawCallCount: number;
    public frameStartTime: number;

    private onscreenRenderTarget: RenderTarget;

    constructor(public gl: WebGL2RenderingContext) {
        this.programCache = new ProgramCache(this.gl);

        this.time = 0;
        this.fov = Math.PI / 4;

        this.projection = mat4.create();
        this.view = mat4.create();
        this.scratchMatrix = mat4.create();
    }

    public reset() {
        this.drawCallCount = 0;
        this.frameStartTime = window.performance.now();
        this.useRenderTarget(this.onscreenRenderTarget);
        this.useFlags(RenderFlags.default);
    }

    public setView(m: mat4) {
        mat4.copy(this.view, m);
    }

    public useRenderTarget(renderTarget: RenderTarget) {
        const gl = this.gl;
        this.currentRenderTarget = renderTarget !== null ? renderTarget : this.onscreenRenderTarget;
        this.bindViewport();
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.currentRenderTarget.msaaFramebuffer);
    }

    public bindViewport(): void {
        const gl = this.gl;
        const width = this.currentRenderTarget.width, height = this.currentRenderTarget.height;
        mat4.perspective(this.projection, this.fov, width / height, this.nearClipPlane, this.farClipPlane);
        gl.viewport(0, 0, width, height);
    }

    public setClipPlanes(near: number, far: number) {
        this.nearClipPlane = near;
        this.farClipPlane = far;
        if (this.currentRenderTarget) {
            const width = this.currentRenderTarget.width, height = this.currentRenderTarget.height;
            mat4.perspective(this.projection, this.fov, width / height, this.nearClipPlane, this.farClipPlane);
        }
    }

    public setOnscreenRenderTarget(renderTarget: RenderTarget) {
        this.onscreenRenderTarget = renderTarget;
    }

    public compileProgram(prog: Program) {
        return prog.compile(this.gl, this.programCache);
    }

    public useProgram(prog: Program) {
        const gl = this.gl;
        this.currentProgram = prog;
        gl.useProgram(this.compileProgram(prog));
    }

    public updateModelView(isSkybox: boolean = false, model: mat4 = null): mat4 {
        const scratch = this.scratchMatrix;
        mat4.copy(scratch, this.view);
        if (isSkybox) {
            scratch[12] = 0;
            scratch[13] = 0;
            scratch[14] = 0;
        }

        if (model)
            mat4.mul(scratch, scratch, model);
        return scratch;
    }

    public bindModelView(isSkybox: boolean = false, model: mat4 = null) {
        const gl = this.gl;
        const prog = this.currentProgram;
        const scratch = this.updateModelView(isSkybox, model);
        gl.uniformMatrix4fv(prog.projectionLocation, false, this.projection);
        gl.uniformMatrix4fv(prog.modelViewLocation, false, scratch);
    }

    public useFlags(flags: RenderFlags) {
        const gl = this.gl;
        // TODO(jstpierre): Move the flattening to a stack, possibly?
        RenderFlags.flatten(flags, this.currentFlags);
        RenderFlags.apply(gl, this.currentFlags, flags);
        this.currentFlags = flags;
    }
}

const DEBUG = true;

function compileShader(gl: WebGL2RenderingContext, str: string, type: number) {
    const shader: WebGLShader = gl.createShader(type);

    gl.shaderSource(shader, str);
    gl.compileShader(shader);

    if (DEBUG && !gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(str);
        if (gl.getExtension('WEBGL_debug_shaders'))
            console.error(gl.getExtension('WEBGL_debug_shaders').getTranslatedShaderSource(shader));
        console.error(gl.getShaderInfoLog(shader));
        throw new Error();
    }

    return shader;
}

export class Program {
    public vert: string;
    public frag: string;

    public projectionLocation: WebGLUniformLocation;
    public modelViewLocation: WebGLUniformLocation;

    private glProg: WebGLProgram;

    public compile(gl: WebGL2RenderingContext, programCache: ProgramCache) {
        if (this.glProg)
            return this.glProg;

        const vert = this.preprocessShader(gl, this.vert, "vert");
        const frag = this.preprocessShader(gl, this.frag, "frag");
        this.glProg = programCache.compileProgram(vert, frag);
        this.bind(gl, this.glProg);
        return this.glProg;
    }

    protected preprocessShader(gl: WebGL2RenderingContext, source: string, type: "vert" | "frag") {
        // Garbage WebGL2 shader compiler until I get something better down the line...
        const lines = source.split('\n').map((n) => {
            // Remove comments.
            return n.replace(/[/][/].*$/, '');
        }).filter((n) => {
            // Filter whitespace.
            const isEmpty = !n || /^\s+%/.test(n);
            return !isEmpty;
        });

        const precision = lines.find((line) => line.startsWith('precision')) || 'precision mediump float;';
        const extensionLines = lines.filter((line) => line.startsWith('#extension'));
        const extensions = extensionLines.filter((line) =>
            line.indexOf('GL_EXT_frag_depth') === -1 ||
            line.indexOf('GL_OES_standard_derivatives') === -1
        ).join('\n');
        const rest = lines.filter((line) => !line.startsWith('precision') && !line.startsWith('#extension')).join('\n');

        const extensionDefines = gl.getSupportedExtensions().map((s) => {
            return `#define HAS_${s}`;
        }).join('\n');
        return `
#version 300 es
#define attribute in
#define varying ${type === 'vert' ? 'out' : 'in'}
${extensionDefines}
#define gl_FragColor o_color
#define gl_FragDepthEXT gl_FragDepth
#define texture2D texture
${extensions}
${precision}
out vec4 o_color;
${rest}
`.trim();
    }

    public bind(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        this.modelViewLocation = gl.getUniformLocation(prog, "u_modelView");
        this.projectionLocation = gl.getUniformLocation(prog, "u_projection");
    }

    public track(arena: RenderArena) {
        arena.programs.push(this);
    }

    public destroy(gl: WebGL2RenderingContext) {
        // TODO(jstpierre): Refcounting in the program cache?
    }
}

class ProgramCache {
    constructor(private gl: WebGL2RenderingContext) {}
    private _cache = new Map<string, WebGLProgram>();

    private _compileProgram(vert: string, frag: string): WebGLProgram {
        const gl = this.gl;
        const vertShader = compileShader(gl, vert, gl.VERTEX_SHADER);
        const fragShader = compileShader(gl, frag, gl.FRAGMENT_SHADER);
        const prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);
        if (DEBUG && !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error(vert);
            console.error(frag);
            console.error(gl.getProgramInfoLog(prog));
            throw new Error();
        }
        gl.deleteShader(vertShader);
        gl.deleteShader(fragShader);
        return prog;
    }

    public compileProgram(vert: string, frag: string) {
        const key = vert + '$' + frag;
        if (!this._cache.has(key))
            this._cache.set(key, this._compileProgram(vert, frag));
        return this._cache.get(key);
    }
}

function pushAndReturn<T>(a: T[], v: T) {
    a.push(v);
    return v;
}

// Optional helper providing a lazy attempt at arena-style garbage collection.
export class RenderArena {
    public textures: WebGLTexture[] = [];
    public samplers: WebGLSampler[] = [];
    public buffers: WebGLBuffer[] = [];
    public vaos: WebGLVertexArrayObject[] = [];
    public programs: Program[] = [];

    public createTexture(gl: WebGL2RenderingContext) {
        return pushAndReturn(this.textures, gl.createTexture());
    }
    public createSampler(gl: WebGL2RenderingContext) {
        return pushAndReturn(this.samplers, gl.createSampler());
    }
    public createBuffer(gl: WebGL2RenderingContext) {
        return pushAndReturn(this.buffers, gl.createBuffer());
    }
    public createVertexArray(gl: WebGL2RenderingContext) {
        return pushAndReturn(this.vaos, gl.createVertexArray());
    }
    public trackProgram(program: Program) {
        program.track(this);
    }

    public destroy(gl: WebGL2RenderingContext) {
        for (const texture of this.textures)
            gl.deleteTexture(texture);
        this.textures = [];
        for (const sampler of this.samplers)
            gl.deleteSampler(sampler);
        this.samplers = [];
        for (const buffer of this.buffers)
            gl.deleteBuffer(buffer);
        this.buffers = [];
        for (const vao of this.vaos)
            gl.deleteVertexArray(vao);
        this.vaos = [];
        for (const program of this.programs)
            program.destroy(gl);
        this.programs = [];
    }
}

export interface CoalescedBuffer {
    buffer: WebGLBuffer;
    offset: number;
}

export interface CoalescedBuffers {
    vertexBuffer: CoalescedBuffer;
    indexBuffer: CoalescedBuffer;
}

export function coalesceBuffer(gl: WebGL2RenderingContext, target: number, datas: ArrayBufferSlice[]): CoalescedBuffer[] {
    let dataLength = 0;
    for (const data of datas) {
        dataLength += data.byteLength;
        dataLength = align(dataLength, 4);
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, dataLength, gl.STATIC_DRAW);

    const coalescedBuffers: CoalescedBuffer[] = [];

    let offset = 0;
    for (const data of datas) {
        const size = data.byteLength;
        coalescedBuffers.push({ buffer, offset });
        gl.bufferSubData(target, offset, data.createTypedArray(Uint8Array));
        offset += size;
        offset = align(offset, 4);
    }

    return coalescedBuffers;
}

export class BufferCoalescer {
    public coalescedBuffers: CoalescedBuffers[];
    private vertexBuffer: WebGLBuffer;
    private indexBuffer: WebGLBuffer;

    constructor(gl: WebGL2RenderingContext, vertexDatas: ArrayBufferSlice[], indexDatas: ArrayBufferSlice[]) {
        assert(vertexDatas.length === indexDatas.length);
        const vertexCoalescedBuffers = coalesceBuffer(gl, gl.ARRAY_BUFFER, vertexDatas);
        const indexCoalescedBuffers = coalesceBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indexDatas);
    
        const coalescedBuffers = [];
        for (let i = 0; i < vertexCoalescedBuffers.length; i++) {
            const vertexBuffer = vertexCoalescedBuffers[i];
            const indexBuffer = indexCoalescedBuffers[i];
            coalescedBuffers.push({ vertexBuffer, indexBuffer });
        }

        this.coalescedBuffers = coalescedBuffers;
        this.vertexBuffer = this.coalescedBuffers[0].vertexBuffer.buffer;
        this.indexBuffer = this.coalescedBuffers[0].indexBuffer.buffer;
    }

    public destroy(gl: WebGL2RenderingContext): void {
        gl.deleteBuffer(this.vertexBuffer);
        gl.deleteBuffer(this.indexBuffer);
    }
}
