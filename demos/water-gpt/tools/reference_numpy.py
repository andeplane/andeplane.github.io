"""Independent numpy reference for GPT-2 small and TinyStories-33M (GPT-Neo).

Dev-only cross-check of the TypeScript forward pass (no torch needed). Prints the greedy
continuation and the last-position top-5 logits for a prompt, given token ids.

  python3 -I tools/reference_numpy.py gpt2 15496,11,616,1438,318 12
  python3 -I tools/reference_numpy.py tinystories <ids> 12
"""
import json
import struct
import sys
import zipfile
import pickle

import numpy as np

W = '/home/claude/model-weights'


def load_safetensors(path):
    with open(path, 'rb') as f:
        n = struct.unpack('<Q', f.read(8))[0]
        header = json.loads(f.read(n))
        base = 8 + n
        out = {}
        for k, v in header.items():
            if k == '__metadata__':
                continue
            a, b = v['data_offsets']
            f.seek(base + a)
            out[k] = np.frombuffer(f.read(b - a), dtype=np.float32).reshape(v['shape'])
        return out


class _Storage:
    def __init__(self, key, numel):
        self.key = key
        self.numel = numel


def load_torch_zip(path):
    z = zipfile.ZipFile(path)
    prefix = z.namelist()[0].split('/')[0]

    def rebuild(storage, offset, size, stride, *rest):
        raw = np.frombuffer(z.read(f'{prefix}/data/{storage.key}'), dtype=np.float32 if storage.dtype == 'f' else np.uint8)
        n = int(np.prod(size)) if len(size) else 1
        return raw[offset:offset + n].reshape(size)

    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2':
                return rebuild
            if name == 'OrderedDict':
                import collections
                return collections.OrderedDict
            if name.endswith('Storage'):
                return name
            raise ValueError(mod + '.' + name)

        def persistent_load(self, pid):
            s = _Storage(pid[2], pid[4])
            s.dtype = 'f' if pid[1] == 'FloatStorage' else 'b'
            return s

    return U(z.open(f'{prefix}/data.pkl')).load()


def ln(x, g, b, eps=1e-5):
    m = x.mean(-1, keepdims=True)
    v = ((x - m) ** 2).mean(-1, keepdims=True)
    return (x - m) / np.sqrt(v + eps) * g + b


def gelu(x):
    return 0.5 * x * (1 + np.tanh(0.7978845608028654 * (x + 0.044715 * x ** 3)))


def forward(model, P, ids):
    T = len(ids)
    if model == 'gpt2':
        g = lambda k: P[k]
        nl, nh, scale = 12, 12, 1 / 8
        x = g('wte.weight')[ids] + g('wpe.weight')[:T]
        windows = [None] * nl
    else:
        g = lambda k: P['transformer.' + k]
        cfg = json.load(open(f'{W}/tinystories-33m-config.json'))
        nl, nh, scale = cfg['num_layers'], cfg['num_heads'], 1.0
        windows = [cfg['window_size'] if t == 'local' else None for t in cfg['attention_layers']]
        x = g('wte.weight')[ids] + g('wpe.weight')[:T]
    x = x.astype(np.float64)
    d = x.shape[1]
    hd = d // nh
    for l in range(nl):
        p = f'h.{l}.'
        a = ln(x, g(p + 'ln_1.weight'), g(p + 'ln_1.bias'))
        if model == 'gpt2':
            qkv = a @ g(p + 'attn.c_attn.weight') + g(p + 'attn.c_attn.bias')
            q, k, v = qkv[:, :d], qkv[:, d:2 * d], qkv[:, 2 * d:]
        else:
            q = a @ g(p + 'attn.attention.q_proj.weight').T
            k = a @ g(p + 'attn.attention.k_proj.weight').T
            v = a @ g(p + 'attn.attention.v_proj.weight').T
        out = np.zeros_like(q)
        for h in range(nh):
            sl = slice(h * hd, (h + 1) * hd)
            s = (q[:, sl] @ k[:, sl].T) * scale
            i = np.arange(T)[:, None]
            j = np.arange(T)[None, :]
            mask = j <= i
            if windows[l]:
                mask &= j > i - windows[l]
            s = np.where(mask, s, -1e30)
            s = np.exp(s - s.max(-1, keepdims=True))
            s /= s.sum(-1, keepdims=True)
            out[:, sl] = s @ v[:, sl]
        if model == 'gpt2':
            x = x + out @ g(p + 'attn.c_proj.weight') + g(p + 'attn.c_proj.bias')
        else:
            x = x + out @ g(p + 'attn.attention.out_proj.weight').T + g(p + 'attn.attention.out_proj.bias')
        a = ln(x, g(p + 'ln_2.weight'), g(p + 'ln_2.bias'))
        if model == 'gpt2':
            hmid = gelu(a @ g(p + 'mlp.c_fc.weight') + g(p + 'mlp.c_fc.bias'))
            x = x + hmid @ g(p + 'mlp.c_proj.weight') + g(p + 'mlp.c_proj.bias')
        else:
            hmid = gelu(a @ g(p + 'mlp.c_fc.weight').T + g(p + 'mlp.c_fc.bias'))
            x = x + hmid @ g(p + 'mlp.c_proj.weight').T + g(p + 'mlp.c_proj.bias')
    a = ln(x, g('ln_f.weight'), g('ln_f.bias'))
    return a @ g('wte.weight').T


def main():
    model = sys.argv[1]
    ids = [int(t) for t in sys.argv[2].split(',')]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    P = load_safetensors(f'{W}/gpt2.safetensors') if model == 'gpt2' else load_torch_zip(f'{W}/tinystories-33m.pytorch_model.bin')
    logits = forward(model, P, ids)
    last = logits[-1]
    top = np.argsort(-last)[:5]
    print(json.dumps({'top5': [[int(i), float(last[i])] for i in top]}))
    for _ in range(n):
        ids.append(int(np.argmax(forward(model, P, ids)[-1])))
    print(json.dumps({'ids': ids}))


main()
