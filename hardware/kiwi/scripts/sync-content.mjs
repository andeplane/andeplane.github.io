// Common hardware plus the selected camera hardware drives each robot's BOM.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = new URL('../../../', import.meta.url)
const research = new URL('hardware/kiwi/research/', root)
const output = new URL('public/hardware/kiwi/', root)
await mkdir(output, { recursive: true })
const readJson = async name => JSON.parse(await readFile(new URL(name, research), 'utf8'))
const [common, configurations, products] = await Promise.all(['parts.json', 'variants.json', 'camera-options.json'].map(readJson))
const sourceHash = createHash('sha256').update(await readFile(new URL('hardware/kiwi/cad/kiwi.py', root))).digest('hex')
const columns = ['id', 'category', 'name', 'quantity', 'unit', 'price', 'currency', 'url', 'note', 'status']
const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`
const variants = await Promise.all(configurations.map(async config => {
  const product = products[config.cameraKey]
  const camera = { id: 'camera', category: 'Sensing', name: `${product.name} · ${product.sku}`, quantity: config.cameraQuantity, unit: 'each', price: product.price, currency: product.currency, url: product.url, note: product.note, status: 'Manufacturer price checked 21 October 2026; final stock and delivery unconfirmed' }
  const extra = config.id === 'three-cameras' ? [
    ...(products.hub ? [{ ...products.hub, id: 'camera_hub', category: 'Compute', quantity: 1, unit: 'each' }] : []),
    ...(products.cameraPower ? [{ ...products.cameraPower, id: 'camera_power', category: 'Power', quantity: 1, unit: 'each' }] : []),
  ] : []
  const cad = JSON.parse(await readFile(new URL(`public/hardware/kiwi/cad/${config.id}/manifest.json`, root), 'utf8'))
  if (cad.variant !== config.id || cad.activeDistanceSensors !== 0 || cad.checks.status !== 'PASS' || cad.sourceSha256 !== sourceHash) throw new Error(`Unqualified CAD/BOM configuration: ${config.id}`)
  if (!cad.cameraPlacement?.length || cad.cameraPlacement.some(camera => !camera.boardInternal)) throw new Error(`Missing inset-camera placement: ${config.id}`)
  const fasteners = cad.fasteners.filter(item => !['hardware_inserts', 'bumper_springs'].includes(item.id)).map(item => ({
    id: item.id, category: 'Assembly', name: item.item, quantity: item.quantity, unit: item.item.includes('and nut') ? 'sets' : 'each',
    url: `/hardware/kiwi/cad/${config.id}/assembly-guide.md`,
    note: `${item.quantity} required, including the spares in the assembly guide. Included in the materials allowance; check fit and screw engagement on the physical assembly.`,
    status: 'Quantity from this model’s CAD assembly schedule; retail cart unquoted',
  }))
  const inserts = cad.fasteners.find(item => item.id === 'hardware_inserts')?.quantity
  const core = common.items.filter(item => !item.id.startsWith('hardware_') && !['clamp_bolts', 'bumper_anchor_pins'].includes(item.id)).map(item => item.id === 'heatset' ? { ...item, note: `100-pack; ${inserts} inserts used by this model. OD 4.6 mm, length 4 mm; nominal 4 mm bore with 5 mm blind depth. Print the fit coupon first. This pack is outside the materials allowance.` } : item)
  return { ...config, cameraProduct: product, cameraPlacement: cad.cameraPlacement, items: [...core, camera, ...extra, ...fasteners] }
}))
await writeFile(new URL('src/features/kiwi/variants.json', root), JSON.stringify(variants, null, 2) + '\n')
for (const variant of variants) {
  const destinations = [new URL(`${variant.id}/`, output), ...(variant.id === 'front-camera' ? [output] : [])]
  const bill = { checkedAt: products.checkedAt, variant: variant.id, name: variant.label, currencyNote: common.currencyNote, items: variant.items }
  for (const destination of destinations) {
    await mkdir(destination, { recursive: true })
    await writeFile(new URL('parts.json', destination), JSON.stringify(bill, null, 2) + '\n')
    const csv = [columns.join(','), ...bill.items.map(item => columns.map(key => cell(item[key])).join(','))].join('\n') + '\n'
    await writeFile(new URL('bill-of-materials.csv', destination), '\ufeff' + csv)
    const intro = `# Kiwi: ${variant.label}\n\nSelected camera: ${variant.cameraQuantity} × [${variant.cameraProduct.name}](${variant.cameraProduct.url}). No distance sensors, multiplexers or dedicated distance-sensor power rail are included.\n\n`
    for (const name of ['parts.md', 'wiring.md']) {
      const list = name === 'parts.md' ? '| Qty | Selected part | Listed unit price |\n|---:|---|---:|\n' + bill.items.map(item => `| ${item.quantity} | [${item.name}](${item.url}) | ${item.price === undefined ? 'In materials allowance' : `${item.currency} ${item.price.toFixed(2)}`} |`).join('\n') + '\n\n' : ''
      await writeFile(new URL(name, destination), intro + list + await readFile(new URL(name, research), 'utf8'))
    }
  }
}
await writeFile(new URL('src/features/kiwi/parts.json', root), JSON.stringify({ items: variants[0].items }, null, 2) + '\n')
for (const name of ['autonomy.md', 'arm.md', 'docking.md', 'camera-options.md', 'camera-options.json', 'mapping.md', 'camera-layout.md']) await copyFile(new URL(name, research), new URL(name, output))
console.log(`Synced ${variants.length} vision-only variants with separate BOMs and camera hardware.`)
