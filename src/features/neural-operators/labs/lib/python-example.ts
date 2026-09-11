export const pythonExample = `import numpy as np

# The SAME field and measurement convention as steps 1–2.
N = 8       # Try 4: information is lost before reconstruction.
M = 96      # Output resolution. Increasing M adds no measurements.

# Localized spots defined directly in space, not as waves.
spots = [(0.32, 0.38, 0.065, 1.5), (0.71, 0.66, 0.095, -1.1)]
def original(x, y):
    mean = sum(2*np.pi*A*sigma**2 for _,_,sigma,A in spots)
    value = np.full(np.broadcast_shapes(x.shape,y.shape), -mean)
    for cx, cy, sigma, A in spots:
        gx = sum(np.exp(-(x-cx+m)**2/(2*sigma**2)) for m in range(-4,5))
        gy = sum(np.exp(-(y-cy+m)**2/(2*sigma**2)) for m in range(-4,5))
        value += A*gx*gy
    return value

# This is the only place we sample the hidden function.
y, x = np.meshgrid(np.arange(N)/N, np.arange(N)/N, indexing="ij")
pixels = original(x, y)

# Recover coefficients FROM PIXELS. This is the DFT.
limit = min(4, (N-1)//2)  # exclude Nyquist and unresolved modes
modes = [(kx, ky) for kx in range(limit+1)
         for ky in range(-limit, limit+1)
         if kx > 0 or ky > 0]
coeffs = []
for kx, ky in modes:
    angle = 2*np.pi*(kx*x + ky*y)
    a = 2*np.mean(pixels*np.cos(angle))
    b = 2*np.mean(pixels*np.sin(angle))
    coeffs.append((kx, ky, a, b))
    if abs(a)+abs(b) > 1e-8:
        print(f"wave ({kx},{ky}): cosine={a:.4f}, sine={b:.4f}")

# Reconstruct without calling original().
yf, xf = np.meshgrid(np.arange(M)/M, np.arange(M)/M, indexing="ij")
reconstructed = np.full((M, M), pixels.mean())
for kx, ky, a, b in coeffs:
    angle = 2*np.pi*(kx*xf + ky*yf)
    reconstructed += a*np.cos(angle) + b*np.sin(angle)

# The hidden formula is used only to check the answer.
truth = original(xf, yf)
error = np.linalg.norm(reconstructed-truth)/np.linalg.norm(truth)
print(f"{N*N} input measurements -> {M*M} output values")
print(f"Relative L2 reconstruction error: {100*error:.4f}%")
# The browser displays these arrays after execution.
plot_data = dict(n=N, out=M, pixels=pixels.ravel().tolist(),
                 reconstructed=reconstructed.ravel().tolist(),
                 truth=truth.ravel().tolist())
`;
