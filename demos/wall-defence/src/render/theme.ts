// Canvas palette — "terraform the void". Open space is the abyss the enemy
// owns; claims flood in as luminous terraformed land; walls are alabaster
// light-slabs; enemies are hot hostile geometry.

export const theme = {
  void0: '#070b12',
  void1: '#0b1019',
  gridLine: 'rgba(64, 96, 112, 0.10)',

  claimDeep: '#11503f',
  claimMain: '#12594a',
  claimLight: '#1c7a5e',
  claimGlow: '#35e0a1',
  claimEdge: 'rgba(53, 224, 161, 0.55)',

  drainBase: '#274238',
  drainWarn: '#ff5a36',

  wall: '#ded7c6',
  wallCore: '#fff8e8',
  wallShadow: '#8f8877',
  wallFresh: '#ffe9a8',

  cutLine: '#7df0ff',
  cutHead: '#e8fdff',
  ghost: 'rgba(125, 240, 255, 0.5)',
  ghostBad: 'rgba(255, 90, 90, 0.5)',

  bouncer: '#e9e4da',
  breaker: '#ff3d5a',
  chaser: '#ff8c1a',
  splitter: '#c86bff',
  fragment: '#ff9db0',

  turret: '#8fd8ff',
  slowTower: '#7dc4ff',
  towerDead: '#4a5560',
  beam: 'rgba(143, 216, 255, 0.9)',
  sparkBeam: 'rgba(125, 240, 255, 0.8)',

  portal: '#ffb020',
  floater: '#35e0a1',
  floaterMoney: '#ffd35c',
}

export const ballColor: Record<number, string> = {
  0: theme.bouncer,
  1: theme.breaker,
  2: theme.chaser,
  3: theme.splitter,
  4: theme.fragment,
}
