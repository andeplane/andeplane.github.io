import type { SeaLandmarkKind } from "../game/levels";

/** Ink silhouettes use the same landmarks as the permanent 3D islands. */
export function drawLandmarkSymbol(ctx: CanvasRenderingContext2D, kind: SeaLandmarkKind, x: number, y: number) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = "#3a4534"; ctx.fillStyle = "#dfd2ad"; ctx.lineWidth = 1.8;
  const path = (points: number[][], fill = false) => {
    ctx.beginPath(); points.forEach(([px, py], i) => { if (i) ctx.lineTo(px!, py!); else ctx.moveTo(px!, py!); });
    if (fill) { ctx.closePath(); ctx.fill(); } ctx.stroke();
  };
  if (kind === "harbour") {
    for (const dx of [-9, 7]) {
      ctx.fillRect(dx - 5, -3, 10, 11); ctx.strokeRect(dx - 5, -3, 10, 11);
      path([[dx-7,-3],[dx,-10],[dx+7,-3]], true);
    }
    path([[-3,8],[-2,-17],[3,-17],[4,8]], true);
    path([[-4,-17],[.5,-21],[5,-17]], true);
  } else if (kind === "smugglers") {
    ctx.fillStyle = "#3a4534";
    ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI, 0); ctx.lineTo(10, 7); ctx.lineTo(-10, 7); ctx.closePath(); ctx.fill();
    path([[-14,8],[-12,-5],[0,-14],[12,-5],[14,8]]);
  } else if (kind === "stormkeep") {
    path([[-11,8],[-11,-11],[-6,-11],[-6,-6],[-2,-6],[-2,-11],[3,-11],[3,-6],[7,-6],[7,-11],[12,-11],[12,8]], true);
    ctx.fillStyle = "#3a4534"; ctx.fillRect(-3, 1, 5, 7);
  } else if (kind === "ruins") {
    ctx.strokeRect(-12, -3, 5, 12); ctx.strokeRect(7, -3, 5, 12);
    ctx.beginPath(); ctx.arc(0, -3, 9.5, Math.PI, 0); ctx.stroke();
    path([[-15,10],[15,10]]);
  } else {
    for (const [dx, h] of [[-7,12],[0,23],[7,15]])
      path([[dx!-4,6],[dx!-3,-h!*.45],[dx!,-h!],[dx!+3,-h!*.45],[dx!+4,6]], true);
  }
  ctx.restore();
}
