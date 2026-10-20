// Research JSON is the source for both the webpage and downloadable purchase list.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
const root = new URL('../../../', import.meta.url)
const research = new URL('hardware/kiwi/research/', root)
const output = new URL('public/hardware/kiwi/', root)
await mkdir(output, { recursive: true })
const bill = JSON.parse(await readFile(new URL('parts.json', research), 'utf8'))
await writeFile(new URL('src/features/kiwi/parts.json', root), JSON.stringify(bill, null, 2) + '\n')
await writeFile(new URL('parts.json', output), JSON.stringify(bill, null, 2) + '\n')
const columns = ['id', 'category', 'name', 'quantity', 'unit', 'price', 'currency', 'url', 'note', 'status']
const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`
const csv = [columns.join(','), ...bill.items.map(item => columns.map(key => cell(item[key])).join(','))].join('\n') + '\n'
await writeFile(new URL('bill-of-materials.csv', output), '\ufeff' + csv)
for (const name of ['parts.md', 'wiring.md', 'autonomy.md', 'arm.md', 'docking.md']) await copyFile(new URL(name, research), new URL(name, output))
console.log(`Synced ${bill.items.length} BOM rows and five technical documents.`)
