import * as THREE from "three";
import { sampleForgeSpark } from "./forgeFire.mjs";

// A shallow camera-facing rim effect is composited inside the WebGL canvas.
// Its height is capped in CSS pixels so it cannot grow over the card ranks when
// the camera reframes for fullscreen. The scene's point lights illuminate cards.
export function createForgeFlames() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const uniforms = { time: { value: 0 }, aspect: { value: 1 }, strength: { value: 1 } };
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: `varying vec2 uvFire;
      void main(){uvFire=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 uvFire;
      uniform float time, aspect, strength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
          mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      float fbm(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
      void main(){
        vec2 p=vec2(uvFire.x*aspect*2.,uvFire.y*3.);
        // Noise is advected upward; lateral warping curls the tongues rather
        // than scaling an entire silhouette in unison.
        float warp=fbm(vec2(p.x*.7,p.y*.65-time*.7));
        p.x+=(warp-.5)*uvFire.y*4.;
        float billow=fbm(vec2(p.x,p.y-time*2.4));
        float fine=noise(vec2(p.x*3.2,p.y*2.-time*4.));
        float height=.12+pow(billow,2.)*1.9;
        float body=height-uvFire.y;
        float alpha=smoothstep(-.035,.09,body)*(1.-smoothstep(.65,1.,uvFire.y));
        alpha*=smoothstep(0.,.025,uvFire.x)*smoothstep(0.,.025,1.-uvFire.x);
        float heat=clamp(body*1.8+(fine-.5)*.12,0.,1.);
        vec3 color=mix(vec3(.72,.035,.003),vec3(1.,.32,.015),smoothstep(0.,.3,heat));
        color=mix(color,vec3(1.,.86,.34),smoothstep(.35,.9,heat));
        gl_FragColor=vec4(color,alpha*strength*.94);
      }`,
  });
  const flame = new THREE.Mesh(geometry, material);
  scene.add(flame);
  const count = 18;
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  const sparkMaterial = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float alpha; varying float opacity; uniform float pixelRatio;
      void main(){opacity=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        gl_PointSize=pixelRatio*(2.+alpha*2.);}`,
    fragmentShader: `varying float opacity; void main(){
      float d=length((gl_PointCoord-.5)*2.);
      gl_FragColor=vec4(1.,.38,.055,opacity*(1.-smoothstep(.15,1.,d)));}`,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.frustumCulled = false;
  scene.add(sparks);
  return {
    render(renderer, width, height, seconds, reducedMotion, strength, clearance) {
      const rimHeight = Math.max(6, Math.min(70, height * 0.13, clearance - 6));
      flame.scale.y = rimHeight / height;
      flame.position.y = -1 + flame.scale.y;
      uniforms.time.value = reducedMotion ? 0 : seconds;
      uniforms.aspect.value = width / rimHeight;
      uniforms.strength.value = strength;
      sparkMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();
      for (let i = 0; i < count; i++) {
        const spark = sampleForgeSpark(i, seconds, reducedMotion);
        positions[i * 3] = spark.x * 2 - 1;
        positions[i * 3 + 1] = -1 + (8 + spark.y * Math.max(0, Math.min(rimHeight * 2.1, clearance - 12))) / height * 2;
        alphas[i] = spark.alpha;
      }
      sparkGeometry.attributes.position.needsUpdate = true;
      sparkGeometry.attributes.alpha.needsUpdate = true;
      // Preserve the cards and table already rendered into the color buffer.
      renderer.autoClear = false;
      try { renderer.render(scene, camera); } finally { renderer.autoClear = true; }
    },
    dispose() {
      geometry.dispose(); material.dispose();
      sparkGeometry.dispose(); sparkMaterial.dispose();
    },
  };
}
