import { sampleForgeFire } from "./forgeFire.mjs";
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
  const deckTarget = document.createElement("button");
  deckTarget.type = "button";
  deckTarget.className = "deck-draw-target";
  deckTarget.setAttribute("aria-label", "Draw from deck");
  deckTarget.title = "Tap the deck to draw";
  deckTarget.addEventListener("click", () => {
    if (model?.canDraw) dispatch({ type: "DRAW" });
  });
  container.append(deckTarget);
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
  // Two inexpensive, unshadowed sources provide actual warm light on cards and steel.
  const fireLights = [
    new THREE.PointLight("#ff620e", 0, 18, 2),
    new THREE.PointLight("#ff9a2e", 0, 18, 2),
  ];
  fireLights.forEach((source) => scene.add(source));

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
  let fireTimeout = null;
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
    const key = `${theme}-${card.suit}-${card.number}`;
    if (faceMaterials.has(key)) return faceMaterials.get(key);
    const texture = ownTexture(
      canvasTexture((ctx, w, h) => drawCardFace(ctx, w, h, card)),
    );
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    // Rugged faces respond to fire; a texture-matched emissive base keeps ink legible.
    const mat =
      theme === "rugged"
        ? material({
            map: texture,
            roughness: 0.85,
            color: 0x999999,
            emissive: 0xffffff,
            emissiveMap: texture,
            emissiveIntensity: 0.55,
          })
        : material(
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
    surfaceMaterial.metalness = theme === "rugged" ? 0.4 : 0;
    ambient.color.set(theme === "rugged" ? "#c2d6ef" : "#ffffff");
    surfaceMaterial.needsUpdate = true;
    light.color.set(palette.light);
    light.intensity = theme === "plain" ? 2 : 3;
    ambient.intensity = theme === "rugged" ? 1.2 : theme === "plain" ? 1.25 : 2;
    renderer.toneMappingExposure =
      theme === "rugged" ? 1.2 : theme === "plain" ? 0.9 : 1.25;
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
  function immersiveShape() {
    if (!container.closest("#app")?.classList.contains("is-fullscreen"))
      return "normal";
    const ratio = container.clientWidth / Math.max(1, container.clientHeight);
    return ratio >= 1.8 ? "wide" : ratio < 0.85 ? "tall" : "normal";
  }
  function columns() {
    return immersiveShape() === "wide" ||
      (model.cards.length > 4 && container.clientWidth >= 600)
      ? 4
      : 2;
  }
  function stackX() {
    return immersiveShape() === "wide"
      ? 4.4
      : immersiveShape() === "tall"
        ? 0.875
        : 2.7;
  }
  function stackZ() {
    if (immersiveShape() === "wide") return 0;
    if (immersiveShape() === "tall")
      return (
        (-Math.ceil((model.cards.length || 4) / columns()) * 2.35) / 2 - 1.2
      );
    return model.cards.length > 4 && columns() === 4 ? -3.65 : -1.5;
  }
  function target(index) {
    const count = columns();
    const rows = Math.ceil(model.cards.length / count);
    return {
      x: ((index % count) - (count - 1) / 2) * 1.75,
      z: (Math.floor(index / count) - (rows - 1) / 2) * 2.35,
      angle: Math.sin(index * 7 + 2) * 0.025,
    };
  }
  function resize() {
    if (disposed) return;
    const width = container.clientWidth || 600,
      height = container.clientHeight || 480;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const shape = immersiveShape();
    const rows = Math.ceil((model?.cards.length || 4) / columns());
    const extentX =
      shape === "wide"
        ? 11
        : shape === "tall"
          ? 4.2
          : width >= 600 && model?.cards.length > 4
            ? 9.5
            : 7;
    const extentZ =
      shape === "wide"
        ? Math.max(3.8, rows * 2.35 + 1.4)
        : shape === "tall"
          ? rows * 2.35 + 3.1
          : Math.max(
              6,
              rows * 2.4 + (rows === 2 && model?.cards.length > 4 ? 4 : 1.5),
            );
    const distance =
      Math.max(extentZ, extentX / camera.aspect) /
      (2 * Math.tan(THREE.MathUtils.degToRad(19)));
    const tilt = shape !== "normal" || width < 600 ? 0.18 : 0.4;
    const centerZ = shape === "tall" ? -1.2 : shape === "wide" ? 0.35 : 0;
    camera.position.set(0, distance, distance * tilt + centerZ);
    camera.lookAt(0, 0, centerZ);
    camera.updateProjectionMatrix();
    if (model) {
      cards.forEach((card, index) => (card.userData.target = target(index)));
      deckMeshes.forEach((card) => {
        card.position.x = -stackX();
        card.position.z = stackZ();
      });
      discardMeshes.forEach((card) => {
        card.position.x = stackX();
        card.position.z = stackZ();
      });
    }
    positionDeckTarget();
    requestRender();
  }
  function positionDeckTarget() {
    deckTarget.hidden = !model?.canDraw || deckMeshes.length === 0;
    if (deckTarget.hidden) return;
    camera.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(deckMeshes.at(-1));
    const points = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(camera);
          points.push({ x: (point.x + 1) / 2, y: (1 - point.y) / 2 });
        }
    const left = Math.min(...points.map((p) => p.x)),
      right = Math.max(...points.map((p) => p.x));
    const top = Math.min(...points.map((p) => p.y)),
      bottom = Math.max(...points.map((p) => p.y));
    Object.assign(deckTarget.style, {
      left: `${(left + right) * 50}%`,
      top: `${(top + bottom) * 50}%`,
      width: `${Math.max(44, (right - left) * container.clientWidth)}px`,
      height: `${Math.max(44, (bottom - top) * container.clientHeight)}px`,
    });
  }
  function pose(progress) {
    cards.forEach((card, index) => {
      const dest = card.userData.target;
      const t = reducedMotion.matches
        ? 1
        : Math.max(0, Math.min(1, (progress - index * 0.1) / 0.6));
      const eased = 1 - Math.pow(1 - t, 3);
      card.position.set(
        THREE.MathUtils.lerp(-stackX(), dest.x, eased),
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
  function cancelRender() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (fireTimeout !== null) clearTimeout(fireTimeout);
    fireTimeout = null;
  }
  function fireActive() {
    return (
      theme === "rugged" &&
      !reducedMotion.matches &&
      !document.hidden &&
      !disposed
    );
  }
  function updateFire(now) {
    const active = fireActive();
    container.dataset.fireActive = String(active);
    const fire = sampleForgeFire(active ? now / 1000 : 0);
    container.style.setProperty("--forge-fire-opacity", String(fire.opacity));
    container.style.setProperty(
      "--forge-fire-scale",
      String(active ? fire.scale : 1),
    );
    container.style.setProperty(
      "--forge-fire-drift",
      `${active ? fire.drift : 0}px`,
    );
    const frontRow = Math.max(
      1.2,
      ...cards.map((card) => card.userData.target.z),
    );
    fireLights.forEach((source, index) => {
      source.visible = theme === "rugged";
      source.position.set(index ? 2.2 : -2.2, 1.9, frontRow + 2);
      source.intensity = 85 * (index ? fire.right : fire.left);
    });
  }
  function render(now) {
    frame = 0;
    if (disposed || document.hidden) return;
    const elapsed = animationStart === null ? 2 : (now - animationStart) / 1000;
    pose(elapsed);
    updateFire(now);
    renderer.render(scene, camera);
    const active =
      animationStart !== null &&
      elapsed < 0.6 + Math.max(0, cards.length - 1) * 0.1 &&
      !reducedMotion.matches;
    container.dataset.animating = String(active);
    if (active) frame = requestAnimationFrame(render);
    else {
      animationStart = null;
      if (fireActive())
        fireTimeout = setTimeout(() => {
          fireTimeout = null;
          requestRender();
        }, 1000 / 30);
    }
  }
  function requestRender() {
    if (fireTimeout !== null) clearTimeout(fireTimeout);
    fireTimeout = null;
    if (!frame && !disposed && !document.hidden)
      frame = requestAnimationFrame(render);
  }
  function update(next, { theme: nextTheme = "casino", animate = false } = {}) {
    if (disposed) return;
    model = next;
    cancelRender();
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
    cancelRender();
    container.dataset.fireActive = String(fireActive());
    if (!document.hidden) {
      animationStart = null;
      requestRender();
    }
  }
  function motionChanged() {
    cancelRender();
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
      cancelRender();
      container.dataset.fireActive = "false";
      for (const property of [
        "--forge-fire-opacity",
        "--forge-fire-scale",
        "--forge-fire-drift",
      ])
        container.style.removeProperty(property);
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
      deckTarget.remove();
    },
  };
}
