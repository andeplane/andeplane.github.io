type Point = [number, number, number];

interface FishGeometry {
  face(color: string, ...points: Point[]): void;
  transform: (p: Point) => Point;
}

/** A coastal mackerel with a forked tail, arched silver flanks and an inlaid eye on each side. */
export function modelFish(batch: FishGeometry, center: Point, size: number, heading: number, hanging: boolean, variety: number) {
  const parent=batch.transform, cs=Math.cos(heading), sn=Math.sin(heading);
  const roll=hanging ? 0 : (variety%2 ? 1 : -1)*(1.19+variety*.095);
  const cr=Math.cos(roll), sr=Math.sin(roll);
  batch.transform=([x,y,z]) => {
    const depth=y*sr+z*cr;
    return parent([center[0]+size*(x*cs+depth*sn),center[1]+size*(y*cr-z*sr),center[2]+size*(-x*sn+depth*cs)]);
  };
  // Body stations: axial position, vertical radius, lateral radius and spine offset.
  const stations: [number,number,number,number][]=[
    [-.35,.045,.035,.012],[-.25,.09,.060,.025],[-.10,.15,.091,.025],[.06,.172,.103,.017],
    [.21,.143,.095,.009],[.31,.109,.078,.017],[.40,.064,.053,.014],[.455,.019,.022,.017],
  ];
  const sections=12, depthScale=hanging ? 1.35 : 1;
  const ring=(s:number,k:number):Point=>{
    const [x,h,w,cy]=stations[s]!,a=k*2*Math.PI/sections;
    return [x,cy+h*Math.cos(a),Math.sin(a)*w*depthScale];
  };
  const back=hanging ? "#277979" : variety%2 ? "#596c86" : "#4f827f";
  const flank=hanging ? "#d1a964" : "#a7bdc8", belly=hanging ? "#f0d18c" : "#deced0";
  for(let s=0;s<stations.length-1;s++) for(let k=0;k<sections;k++){
    const light=Math.cos((k+.5)*2*Math.PI/sections);
    const tint=light>.58 ? back : light>.16 ? (hanging ? "#619887" : "#89a6b1") : light>-.50 ? flank : belly;
    batch.face(tint,ring(s,k),ring(s,k+1),ring(s+1,k+1),ring(s+1,k));
  }
  batch.face(flank,...Array.from({length:sections},(_,k)=>ring(stations.length-1,k)));
  batch.face(flank,...Array.from({length:sections},(_,k)=>ring(0,k)).reverse());
  // Curved two-lobed caudal fin. Use separate convex fans so the notch stays cut out.
  const fin = (tint:string, ...points:Point[]) => {
    batch.face(tint,...points); batch.face(tint,...points.reverse());
  };
  fin(back,[-.29,.037,0],[-.49,.207,.019],[-.565,.23,.02],[-.477,.074,.01],[-.392,.005,0]);
  fin(flank,[-.392,.005,0],[-.485,-.06,.015],[-.555,-.176,.035],[-.477,-.142,.03],[-.29,-.022,0]);
  fin(back,[-.11,.15,0],[-.105,.28,0],[-.022,.202,0],[.08,.175,0]);
  fin(flank,[-.14,-.10,0],[-.185,-.19,0],[-.024,-.142,0]);
  for (const side of [-1,1]) {
    const cheek=.085*depthScale;
    const detail=(tint:string, points:Point[])=>{
      batch.face(tint,...(side>0 ? points : points.reverse()));
    };
    const eye=(tint:string,x:number,y:number,r:number,w:number)=>{
      const polygon=Array.from({length:12},(_,i):Point=>{
        const a=i*Math.PI/6;
        return [x+r*Math.cos(a),y+r*Math.sin(a),side*w];
      });
      detail(tint,polygon);
    };
    eye("#edc67c",.307,.046,.046,cheek+.004);
    eye("#243538",.314,.048,.032,cheek+.007);
    eye("#fff3d4",.325,.058,.011,cheek+.010);
    // Gill sickle and pectoral fin project slightly off the flank.
    const edge=side*(.10*depthScale+.004);
    detail(hanging ? "#957446" : "#798595",[[.22,.112,edge*.78],[.176,.048,edge],[.178,-.045,edge*.99],[.209,-.078,edge*.83],[.195,-.026,edge],[.194,.04,edge*1.01]]);
    fin(hanging ? "#957e48" : "#778e9a",[.135,.015,edge],[.030,-.058,edge*1.45],[-.035,-.054,edge*1.67],[.08,.005,edge*1.30]);
    for(let i=0; i<4; i++) {
      const x=-.19+i*.068, curve=1-.20*Math.abs(i-2), z=side*(.080*depthScale*curve);
      fin(hanging ? "#30706a" : "#597780",[x,.126*curve,z*.79],[x-.019,.079*curve,z*1.12],[x+.001,.049*curve,z*1.23],[x+.013,.093*curve,z]);
    }
  }
  batch.transform=parent;
}
