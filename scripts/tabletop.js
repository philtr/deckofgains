import * as THREE from "three";
import { tabletopThemes } from "./theme.js";
import {
  createSurfacePixels,
  createRuggedReliefPixels,
  drawCardFace,
  drawCardBack,
} from "./tabletopArtwork.mjs";

const cardWidth = 1.45;
const cardHeight = 2.05;

function canvasTexture(draw, width = 384, height = 544) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function cardShape() {
  const w = cardWidth / 2,
    h = cardHeight / 2,
    r = 0.1;
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return shape;
}

export function createTabletop({ container, dispatch, onFailure }) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const ambient = new THREE.HemisphereLight("#ffffff", "#51463c", 2.0);
  scene.add(ambient);
  const light = new THREE.DirectionalLight("#ffedd1", 3.0);
  light.position.set(-3, 8, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, {
    left: -9,
    right: 9,
    top: 9,
    bottom: -9,
    near: 0.1,
    far: 30,
  });
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.025;
  light.shadow.radius = 3;
  scene.add(light);

  const ownedTextures = new Set();
  const ownedMaterials = new Set();
  const ownTexture = (texture) => {
    ownedTextures.add(texture);
    return texture;
  };
  const material = (settings, Material = THREE.MeshStandardMaterial) => {
    const value = new Material(settings);
    ownedMaterials.add(value);
    return value;
  };
  const shape = cardShape();
  const edgeGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.025,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.008,
    bevelThickness: 0.005,
  });
  const faceGeometry = new THREE.ShapeGeometry(shape);
  // ShapeGeometry has world-space UVs; map the whole face to a single card image.
  const uv = faceGeometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      (uv.getX(i) + cardWidth / 2) / cardWidth,
      (uv.getY(i) + cardHeight / 2) / cardHeight,
    );
  const tableGeometry = new THREE.PlaneGeometry(100, 100);
  const edgeMaterial = material({ color: "#e9e3d5", roughness: 0.8 });
  const surfaceMaterial = material({ roughness: 0.95 });
  const table = new THREE.Mesh(tableGeometry, surfaceMaterial);
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);
  const faceMaterials = new Map();
  let backMaterial;
  let theme;
  let cards = [];
  let deckMeshes = [];
  let discardMeshes = [];
  let frame = 0;
  let disposed = false;
  let model;
  let animationStart = null;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function createCard(front = null) {
    const group = new THREE.Group();
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.castShadow = true;
    edge.receiveShadow = true;
    group.add(edge);
    const face = new THREE.Mesh(faceGeometry, front || backMaterial);
    face.position.z = 0.032;
    face.castShadow = true;
    face.receiveShadow = true;
    const back = new THREE.Mesh(faceGeometry, backMaterial);
    back.rotation.y = Math.PI;
    back.position.z = -0.008;
    group.add(face, back);
    group.rotation.x = -Math.PI / 2;
    scene.add(group);
    return group;
  }
  function faceFor(card) {
    const key = `${card.suit}-${card.number}`;
    if (faceMaterials.has(key)) return faceMaterials.get(key);
    const texture = ownTexture(
      canvasTexture((ctx, w, h) => drawCardFace(ctx, w, h, card)),
    );
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const mat = material(
      { map: texture, toneMapped: false },
      THREE.MeshBasicMaterial,
    );
    faceMaterials.set(key, mat);
    return mat;
  }
  function applyTheme(next) {
    if (theme === next) return;
    theme = next;
    const palette = tabletopThemes[theme] || tabletopThemes.casino;
    if (surfaceMaterial.map) {
      surfaceMaterial.map.dispose();
      ownedTextures.delete(surfaceMaterial.map);
    }
    surfaceMaterial.map = ownTexture(
      canvasTexture(
        (ctx, w, h) => {
          const image = ctx.createImageData(w, h);
          image.data.set(createSurfacePixels(theme, palette, w));
          ctx.putImageData(image, 0, 0);
        },
        512,
        512,
      ),
    );
    surfaceMaterial.map.wrapS = surfaceMaterial.map.wrapT =
      THREE.RepeatWrapping;
    surfaceMaterial.map.repeat.set(20, 20);
    if (surfaceMaterial.bumpMap) {
      surfaceMaterial.bumpMap.dispose();
      ownedTextures.delete(surfaceMaterial.bumpMap);
      surfaceMaterial.bumpMap = null;
    }
    if (theme === "rugged") {
      surfaceMaterial.bumpMap = ownTexture(
        canvasTexture(
          (ctx, w, h) => {
            const image = ctx.createImageData(w, h);
            image.data.set(createRuggedReliefPixels(w));
            ctx.putImageData(image, 0, 0);
          },
          512,
          512,
        ),
      );
      surfaceMaterial.bumpMap.colorSpace = THREE.NoColorSpace;
      surfaceMaterial.bumpMap.wrapS = surfaceMaterial.bumpMap.wrapT =
        THREE.RepeatWrapping;
      surfaceMaterial.bumpMap.repeat.set(20, 20);
    }
    surfaceMaterial.bumpScale = theme === "rugged" ? 0.035 : 0;
    surfaceMaterial.roughness = palette.roughness;
    surfaceMaterial.needsUpdate = true;
    light.color.set(palette.light);
    light.intensity = theme === "plain" ? 2 : 3;
    ambient.intensity = theme === "rugged" ? 0.9 : theme === "plain" ? 1.25 : 2;
    renderer.toneMappingExposure =
      theme === "rugged" ? 1.05 : theme === "plain" ? 0.9 : 1.25;
    scene.background = new THREE.Color(palette.surface);
    if (backMaterial) {
      backMaterial.map.dispose();
      ownedTextures.delete(backMaterial.map);
      backMaterial.dispose();
      ownedMaterials.delete(backMaterial);
    }
    backMaterial = material({
      roughness: 0.75,
      map: ownTexture(
        canvasTexture((ctx, w, h) => {
          drawCardBack(ctx, w, h, theme, palette);
        }),
      ),
    });
  }
  function clearObjects() {
    for (const mesh of [...cards, ...deckMeshes, ...discardMeshes])
      scene.remove(mesh);
    cards = [];
    deckMeshes = [];
    discardMeshes = [];
  }
  function stackZ() {
    const columns =
      model.cards.length > 4 && container.clientWidth >= 600 ? 4 : 2;
    return model.cards.length > 4 && columns === 4 ? -3.65 : -1.5;
  }
  function target(index) {
    const columns =
      model.cards.length > 4 && container.clientWidth >= 600 ? 4 : 2;
    const rows = Math.ceil(model.cards.length / columns);
    return {
      x: ((index % columns) - (columns - 1) / 2) * 1.75,
      z: (Math.floor(index / columns) - (rows - 1) / 2) * 2.35,
      angle: Math.sin(index * 7 + 2) * 0.025,
    };
  }
  function resize() {
    if (disposed) return;
    const width = container.clientWidth || 600,
      height = container.clientHeight || 480;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const rows = Math.ceil(
      (model?.cards.length || 4) /
        (width >= 600 && model?.cards.length > 4 ? 4 : 2),
    );
    const extentX = width >= 600 && model?.cards.length > 4 ? 9.5 : 7.0;
    const extentZ = Math.max(
      6,
      rows * 2.4 + (rows === 2 && model?.cards.length > 4 ? 4 : 1.5),
    );
    const distance =
      Math.max(extentZ, extentX / camera.aspect) /
      (2 * Math.tan(THREE.MathUtils.degToRad(19)));
    const tilt = width < 600 ? 0.18 : 0.4;
    camera.position.set(0, distance, distance * tilt);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (model) {
      cards.forEach((card, index) => (card.userData.target = target(index)));
      [...deckMeshes, ...discardMeshes].forEach(
        (card) => (card.position.z = stackZ()),
      );
    }
    requestRender();
  }
  function pose(progress) {
    cards.forEach((card, index) => {
      const dest = card.userData.target;
      const t = reducedMotion.matches
        ? 1
        : Math.max(0, Math.min(1, (progress - index * 0.1) / 0.6));
      const eased = 1 - Math.pow(1 - t, 3);
      card.position.set(
        THREE.MathUtils.lerp(-2.7, dest.x, eased),
        0.07 + Math.sin(t * Math.PI) * 0.7,
        THREE.MathUtils.lerp(stackZ(), dest.z, eased),
      );
      card.rotation.set(
        -Math.PI / 2,
        (1 - eased) * Math.PI,
        dest.angle * eased,
      );
    });
  }
  function render(now) {
    frame = 0;
    if (disposed || document.hidden) return;
    const elapsed = animationStart === null ? 2 : (now - animationStart) / 1000;
    pose(elapsed);
    renderer.render(scene, camera);
    const active =
      animationStart !== null &&
      elapsed < 0.6 + Math.max(0, cards.length - 1) * 0.1 &&
      !reducedMotion.matches;
    container.dataset.animating = String(active);
    if (active) frame = requestAnimationFrame(render);
    else animationStart = null;
  }
  function requestRender() {
    if (!frame && !disposed && !document.hidden)
      frame = requestAnimationFrame(render);
  }
  function update(next, { theme: nextTheme = "casino", animate = false } = {}) {
    if (disposed) return;
    model = next;
    cancelAnimationFrame(frame);
    frame = 0;
    applyTheme(nextTheme);
    clearObjects();
    for (let i = 0; i < Math.ceil(model.remainingCards / 4); i++) {
      const card = createCard();
      card.position.set(-2.7, 0.04 + i * 0.028, -1.5);
      deckMeshes.push(card);
    }
    for (let i = 0; i < Math.ceil(model.discardedCards / 6); i++) {
      const card = createCard();
      card.position.set(2.7, 0.04 + i * 0.028, -1.5);
      card.rotation.z = Math.sin(i) * 0.12;
      discardMeshes.push(card);
    }
    cards = model.cards.map((card) => createCard(faceFor(card)));
    resize();
    animationStart =
      animate && !reducedMotion.matches ? performance.now() : null;
    container.dataset.animating = String(animationStart !== null);
    pose(animationStart === null ? 2 : 0);
    requestRender();
  }
  function click(event) {
    if (!model?.canDraw) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObjects(deckMeshes, true).length)
      dispatch({ type: "DRAW" });
  }
  function lost(event) {
    event.preventDefault();
    onFailure();
  }
  function visibility() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!document.hidden) {
      animationStart = null;
      requestRender();
    }
  }
  function motionChanged() {
    animationStart = null;
    requestRender();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  renderer.domElement.addEventListener("click", click);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", visibility);
  reducedMotion.addEventListener("change", motionChanged);
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reducedMotion.removeEventListener("change", motionChanged);
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      clearObjects();
      for (const texture of ownedTextures) texture.dispose();
      for (const mat of ownedMaterials) mat.dispose();
      edgeGeometry.dispose();
      faceGeometry.dispose();
      tableGeometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
