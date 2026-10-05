import {describe,expect,it} from 'vitest';
import {CoinRestWindow} from './coinRest';
const sample=(x:number,y=1,nx=0)=>({x,y,z:0,nx,ny:Math.sqrt(1-nx*nx),nz:0});
describe('coin displacement settling window',()=>{
  it('finishes millimetre contact oscillations within half a second',()=>{
    const window=new CoinRestWindow();
    for(let i=0;i<29;i++)expect(window.sample(sample(i%2*.001))).toBe(false);
    expect(window.sample(sample(.001))).toBe(true);
  });
  it('does not cancel visible back-and-forth motion or continuing rolling',()=>{
    const oscillating=new CoinRestWindow(),rolling=new CoinRestWindow();
    for(let i=0;i<120;i++){
      expect(oscillating.sample(sample(i%2*.02))).toBe(false);
      expect(rolling.sample(sample(i*.004))).toBe(false);
    }
  });
  it('waits through falling/tilting then finishes when motion stops',()=>{
    const falling=new CoinRestWindow(),tilting=new CoinRestWindow();
    for(let i=0;i<60;i++){
      expect(falling.sample(sample(0,3-i*.02))).toBe(false);
      expect(tilting.sample(sample(0,1,i%2*.2))).toBe(false);
    }
    for(let i=0;i<29;i++)falling.sample(sample(0,1.82));
    expect(falling.sample(sample(0,1.82))).toBe(true);
  });
});
