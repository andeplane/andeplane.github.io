# Optional purchased Black Pearl

The original ship remains the default in a checkout without purchased assets.
Vite automatically uses CrispierCone's Black Pearl when both `.private/black-pearl.glb`
and `.private/black-pearl.json` exist at startup/build time. This applies to `npm run dev`,
`npm run build`, and the existing `ios:sync`, `ios:open`, and `ios:build:sim` commands.
Restart the development server after importing or removing the model.

## Import once on your Mac

Keep the purchased archive outside the repository. With Blender installed:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec \
  --python tools/blender/import_crispiercone.py -- \
  ~/Downloads/black-pearl-pirate-ship.zip
```

The script opens the native Blender source with scripts disabled, rebuilds portable
PBR materials, reduces mesh density, exports 1K colour/512px surface textures, and
extracts walking surfaces. It creates an ignored `.private/` folder. Copy that folder
to `demos/broadside/.private/` in another local checkout if you build there.
The original archive and source remain untouched.

## Play and install

```sh
npm run dev
npm run ios:open
```

The new ship is used in battles and for first-person exploration. **Treasure room**
opens the cabin beneath the quarterdeck; **Visit your ship** starts on the main deck.
Walk through the central stern doorway, or climb the starboard staircase onto the
quarterdeck. Earned gold and world keepsakes appear inside. Keyboard and touch
walking, looking and jumping use the existing controls. Chart buttons start voyages.

`ios:open` builds and bundles the model inside the offline app. Follow [IOS.md](IOS.md)
for signing and installing on a connected iPhone. A simulator build does not verify
performance or installation on the physical phone.

## Public builds and license

The paid export is for the purchaser's private family installation. The source listing
is [CrispierCone's Black Pearl on CGTrader](https://www.cgtrader.com/3d-models/watercraft/recreational-watercraft/black-pearl-pirate-ship).
Keep the purchase receipt and applicable Royalty Free / no-AI license with the archive.
The purchase does not make the source mesh or textures freely redistributable.

Purchased files, generated bundles and native copied resources are ignored by Git.
The homepage's `scripts/build-demos.mjs` always sets `BROADSIDE_PUBLIC_BUILD=1`, which
excludes the purchased asset even on a Mac where it is installed. For a standalone
public demo build use `npm run build:public`. Ordinary local `dist/` and `dist-ios/`
can contain the paid model and should remain private.

The code, importer, room joinery and controller can be reviewed in the public PR;
the purchased archive, meshes, texture images and walking manifest are not in it.
