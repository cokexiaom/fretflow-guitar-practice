import * as THREE from './assets/three.module.min.js';

const canvas = document.querySelector('#cowboy-3d-canvas');
if (canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x172224);
  scene.fog = new THREE.Fog(0x172224, 8, 20);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 50);
  camera.position.set(0, 2.35, 9.6);
  camera.lookAt(0, 1.55, 0);

  const hemi = new THREE.HemisphereLight(0xf4bd7a, 0x14201d, 2.4); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffd092, 4.2); key.position.set(-4, 7, 5); key.castShadow = true; scene.add(key);
  const rim = new THREE.PointLight(0xe87b47, 65, 16); rim.position.set(4.5, 3.2, -2); scene.add(rim);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(32, 24), new THREE.MeshStandardMaterial({ color: 0x35291f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(.72, 32, 16), new THREE.MeshBasicMaterial({ color: 0xf6b85e })); sun.position.set(5.1, 4.6, -5); scene.add(sun);
  for (let i = 0; i < 14; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.25 + Math.random() * .55, 0), new THREE.MeshStandardMaterial({ color: 0x443329, roughness: 1 }));
    rock.position.set((Math.random() - .5) * 15, .05, -2 - Math.random() * 7); rock.scale.y = .35; scene.add(rock);
  }

  const cowboy = new THREE.Group(); cowboy.position.y = .05; scene.add(cowboy);
  const mat = (color, roughness = .72, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const skin = mat(0xa96848), denim = mat(0x243b3a), dark = mat(0x171714), leather = mat(0x3b2619), boot = mat(0x211a15), brass = mat(0xc78b37, .32, .35);
  const mesh = (geometry, material, parent = cowboy) => { const item = new THREE.Mesh(geometry, material); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item; };

  const crate = mesh(new THREE.BoxGeometry(1.5, .72, .78), mat(0x60432e)); crate.position.set(0, .48, .15);
  for (const x of [-.53, 0, .53]) { const slat = mesh(new THREE.BoxGeometry(.05, .75, .81), mat(0x2c211a)); slat.position.set(x, .48, .15); }
  const torso = mesh(new THREE.CapsuleGeometry(.62, 1.1, 8, 16), denim); torso.position.set(0, 2.15, 0); torso.rotation.z = .02;
  const head = mesh(new THREE.SphereGeometry(.47, 32, 24), skin); head.position.set(0, 3.42, .02); head.scale.y = 1.08;
  const neck = mesh(new THREE.CylinderGeometry(.23, .27, .34, 20), skin); neck.position.set(0, 2.94, 0);
  const scarf = mesh(new THREE.TorusGeometry(.43, .08, 10, 30), mat(0xa84f2f)); scarf.rotation.x = Math.PI / 2; scarf.position.set(0, 2.93, .04);
  const hatBrim = mesh(new THREE.CylinderGeometry(.82, .82, .09, 32), dark); hatBrim.scale.z = .58; hatBrim.position.set(0, 3.82, 0);
  const hatTop = mesh(new THREE.CylinderGeometry(.42, .54, .52, 32), leather); hatTop.position.set(0, 4.05, 0); hatTop.scale.z = .82;
  const hatBand = mesh(new THREE.CylinderGeometry(.545, .545, .1, 32), mat(0xb76b36)); hatBand.position.set(0, 3.87, 0); hatBand.scale.z = .83;
  for (const x of [-.17, .17]) { const eye = mesh(new THREE.SphereGeometry(.035, 12, 8), dark); eye.position.set(x, 3.48, .45); }
  const moustache = mesh(new THREE.TorusGeometry(.13, .035, 7, 18, Math.PI), dark); moustache.rotation.z = Math.PI; moustache.position.set(0, 3.28, .46);

  const leftLeg = mesh(new THREE.CapsuleGeometry(.2, 1.15, 6, 12), denim); leftLeg.position.set(-.42, .63, .16); leftLeg.rotation.z = -.22;
  const rightLeg = mesh(new THREE.CapsuleGeometry(.2, 1.15, 6, 12), denim); rightLeg.position.set(.42, .63, .16); rightLeg.rotation.z = .22;
  for (const x of [-.62, .62]) { const shoe = mesh(new THREE.BoxGeometry(.65, .24, .42), boot); shoe.position.set(x, .12, .36); shoe.rotation.y = x < 0 ? -.08 : .08; }

  const guitar = new THREE.Group(); guitar.position.set(-.18, 1.88, .57); guitar.rotation.set(-.04, -.08, -1.47); guitar.scale.set(.88, .88, .88); cowboy.add(guitar);
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(0, 1.03); bodyShape.bezierCurveTo(.25, .98, .48, .76, .42, .5); bodyShape.bezierCurveTo(.36, .27, .65, .18, .7, -.18); bodyShape.bezierCurveTo(.77, -.7, .38, -1.02, 0, -1.04); bodyShape.bezierCurveTo(-.38, -1.02, -.77, -.7, -.7, -.18); bodyShape.bezierCurveTo(-.65, .18, -.36, .27, -.42, .5); bodyShape.bezierCurveTo(-.48, .76, -.25, .98, 0, 1.03);
  const body = mesh(new THREE.ExtrudeGeometry(bodyShape, { depth: .22, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .06, bevelThickness: .05 }), mat(0xb9682b, .38), guitar); body.scale.set(1.05, 1.05, 1.05);
  const soundHole = mesh(new THREE.CylinderGeometry(.25, .25, .018, 40), mat(0x1a100b), guitar); soundHole.rotation.x = Math.PI / 2; soundHole.position.set(0, .26, .29);
  const rosette = mesh(new THREE.TorusGeometry(.3, .025, 8, 40), brass, guitar); rosette.position.set(0, .26, .305);
  const bridge = mesh(new THREE.BoxGeometry(.62, .1, .08), dark, guitar); bridge.position.set(0, -.48, .32);
  const neckGroup = new THREE.Group(); neckGroup.position.set(0, .92, .14); guitar.add(neckGroup);
  const neckWood = mesh(new THREE.BoxGeometry(.23, 2.3, .12), leather, neckGroup); neckWood.position.y = 1.05;
  const fretboard = mesh(new THREE.BoxGeometry(.27, 2.18, .055), mat(0x25170f), neckGroup); fretboard.position.set(0, 1.03, .09);
  for (let i = 0; i < 12; i++) { const fret = mesh(new THREE.BoxGeometry(.3, .012, .075), brass, neckGroup); fret.position.set(0, .12 + i * .17, .13); }
  const headstock = mesh(new THREE.BoxGeometry(.38, .55, .14), leather, neckGroup); headstock.position.set(0, 2.46, .02); headstock.scale.x = .85;
  for (const side of [-1, 1]) for (const y of [2.3, 2.47, 2.64]) { const peg = mesh(new THREE.SphereGeometry(.055, 12, 8), brass, neckGroup); peg.position.set(side * .23, y, .05); }
  const strings = [];
  for (let i = 0; i < 6; i++) { const string = mesh(new THREE.BoxGeometry(.007 + i * .001, 3.37, .006), mat(0xd8c7a8, .25, .72), guitar); string.position.set((i - 2.5) * .035, .9, .36); strings.push(string); }

  const strumArmPivot = new THREE.Group(); strumArmPivot.position.set(-.54, 2.47, .56); cowboy.add(strumArmPivot);
  const strumArm = mesh(new THREE.CapsuleGeometry(.12, .78, 6, 12), skin, strumArmPivot); strumArm.position.set(.25, -.3, .18); strumArm.rotation.z = -.76;
  const fretArm = mesh(new THREE.CapsuleGeometry(.12, 1.08, 6, 12), skin); fretArm.position.set(.62, 2.49, .52); fretArm.rotation.z = .9;

  let strumKick = 0; let last = performance.now();
  const resize = () => { const rect = canvas.getBoundingClientRect(); const width = Math.max(1, rect.width), height = Math.max(1, rect.height); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  const strum = (stringNumber = 3) => { strumKick = 1; strings.forEach((string, index) => { string.scale.x = index === 6 - stringNumber ? 3 : 1.4; }); };
  document.addEventListener('fretflow:strum', event => strum(event.detail?.string));
  document.addEventListener('fretflow:stage-resize', resize);
  new ResizeObserver(resize).observe(canvas); resize();
  function animate(now) {
    requestAnimationFrame(animate); const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now * .001;
    if (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio()) || canvas.height !== Math.round(canvas.clientHeight * renderer.getPixelRatio())) resize();
    cowboy.position.y = .05 + Math.sin(t * 1.5) * .025; torso.rotation.z = Math.sin(t * 1.3) * .018;
    strumKick = Math.max(0, strumKick - dt * 4.7); strumArmPivot.rotation.z = Math.sin(strumKick * Math.PI) * -.52;
    strings.forEach((string, index) => { string.position.x = (index - 2.5) * .035 + Math.sin(t * 62 + index) * .005 * strumKick; string.scale.x += (1 - string.scale.x) * .16; });
    camera.position.x = Math.sin(t * .15) * .13; camera.lookAt(0, 1.65, 0); renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
