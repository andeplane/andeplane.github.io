import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sitePagePath } from '../../src/components/blog/sitePagePath.ts'

test('article-to-page links stay in the hash router, including existing root hash links', () => {
  for (const href of ['/blog/a-brick-wall-from-the-weak-form-up', '/projects/tube-sim', '/about', '/', '/interests/music', '/interests/physics', '/interests/neural-operators/reading?doc=notes/fno-2020.md']) {
    assert.equal(sitePagePath(href), href)
    assert.equal(sitePagePath('/#' + href), href)
  }
})

test('standalone demos, assets, external URLs and existing fragment links remain anchors', () => {
  for (const href of ['/demos/grover/', '/blog/enigma/signal-path.svg', '/blog/paper.pdf', '/projects/preview.png', 'https://example.com/blog/a', '//example.com/blog/a', '#/blog/a', '#section', 'mailto:a@example.com']) {
    assert.equal(sitePagePath(href), null, href)
  }
})
