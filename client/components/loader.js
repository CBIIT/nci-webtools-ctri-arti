import { createEffect, onCleanup, onMount } from "solid-js";
import html from "solid-js/html";
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.175.0/build/three.module.js";

export const DEFAULT_CONFIG = {
  dna: {
    // If no sequence attribute is provided, a random one of this length is generated.
    sequence: null,
    sequenceLength: 20,
    turns: 2,
    height: 80,
    radius: 3,
    backboneThickness: 0.3,
    baseRadius: 0.25,
    baseGap: 0.15,
  },
  colors: {
    nucleotides: {
      A: { color: 0xff6b6b, pair: "T", pairColor: 0x4ca5ff },
      T: { color: 0x4ca5ff, pair: "A", pairColor: 0xff6b6b },
      C: { color: 0x7bed9f, pair: "G", pairColor: 0xffa502 },
      G: { color: 0xffa502, pair: "C", pairColor: 0x7bed9f },
    },
    backbones: {
      primary: 0x2e8bc0,
      secondary: 0x145da0,
    },
  },
  animation: {
    damping: 0.9,
    rotationSpeed: 0.0005,
  },
  camera: {
    fov: 10,
    near: 0.01,
    far: 150,
    position: { x: 0, y: 0, z: 40 },
  },
};

export default function DNASpinner(props) {
  let canvasRef;
  let containerRef;
  let renderer;
  let camera;
  let scene;
  let animationFrameRequestId;
  let resizeObserver;

  // State variables
  let targetRotation = { x: 0, y: 0 };
  let currentRotation = { x: 0, y: 0 };
  let rotationVelocity = { x: 0, y: 0 };

  // Merge default config with props
  const config = structuredClone(DEFAULT_CONFIG);

  // Helper functions
  function applyProps() {
    if (props.sequence) {
      config.dna.sequence = props.sequence;
    }
    if (props.rotationSpeed !== undefined) {
      config.animation.rotationSpeed = parseFloat(props.rotationSpeed);
    }
    if (props.turns !== undefined) {
      config.dna.turns = parseFloat(props.turns);
    }
    if (props.height !== undefined) {
      config.dna.height = parseFloat(props.height);
    }
    if (props.radius !== undefined) {
      config.dna.radius = parseFloat(props.radius);
    }
    if (props.backboneThickness !== undefined) {
      config.dna.backboneThickness = parseFloat(props.backboneThickness);
    }
    if (props.baseRadius !== undefined) {
      config.dna.baseRadius = parseFloat(props.baseRadius);
    }
    if (props.baseGap !== undefined) {
      config.dna.baseGap = parseFloat(props.baseGap);
    }
  }

  function onResize() {
    if (!containerRef || !renderer || !camera) return;

    const rect = containerRef.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  function setup() {
    if (!canvasRef || !containerRef) return;

    renderer = new THREE.WebGLRenderer({
      canvas: canvasRef,
      antialias: true,
      alpha: true,
    });

    const rect = containerRef.getBoundingClientRect();
    renderer.setSize(rect.width || window.innerWidth, rect.height || window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    const { fov, near, far, position } = config.camera;
    camera = new THREE.PerspectiveCamera(fov, rect.width / rect.height, near, far);
    camera.position.set(position.x, position.y, position.z);
  }

  function createScene() {
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff));
  }

  function generateRandomSequence(length) {
    const bases = Object.keys(config.colors.nucleotides);
    let seq = "";
    for (let i = 0; i < length; i++) {
      seq += bases[Math.floor(Math.random() * bases.length)];
    }
    return seq;
  }

  function createBackboneMaterial(color) {
    return new THREE.MeshBasicMaterial({ color });
  }

  function helixFunction(t, phase = 0) {
    const { turns, height, radius } = config.dna;
    const angle = 2 * Math.PI * turns * t + phase;
    const y = -height / 2 + height * t;
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    return new THREE.Vector3(x, y, z);
  }

  function createBackbone(phase, color) {
    const numPoints = 200;
    const curve = new THREE.Curve();
    curve.getPoint = (t) => helixFunction(t, phase);

    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      numPoints,
      config.dna.backboneThickness,
      8,
      false
    );
    return new THREE.Mesh(tubeGeometry, createBackboneMaterial(color));
  }

  function createBasePairs(sequence) {
    const group = new THREE.Group();
    const numPairs = sequence.length;
    const { baseRadius, baseGap } = config.dna;
    const nucleotideColors = config.colors.nucleotides;

    for (let i = 0; i < numPairs; i++) {
      const t = i / numPairs;
      const base = sequence[i];
      const baseInfo = nucleotideColors[base] || nucleotideColors["A"];

      const p1 = helixFunction(t, 0);
      const p2 = helixFunction(t, Math.PI);

      const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const totalDistance = p1.distanceTo(p2);
      const halfLength = (totalDistance - baseGap) / 2;

      const createBasePair = (position, color) => {
        const geometry = new THREE.CylinderGeometry(baseRadius, baseRadius, halfLength, 8);
        geometry.translate(0, halfLength / 2, 0);
        const material = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        return mesh;
      };

      const leftPair = createBasePair(p1, baseInfo.color);
      const rightPair = createBasePair(p2, baseInfo.pairColor);

      const alignToCenter = (mesh, start, end) => {
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction
        );
        mesh.setRotationFromQuaternion(quaternion);
      };

      alignToCenter(leftPair, p1, center);
      alignToCenter(rightPair, p2, center);

      group.add(leftPair);
      group.add(rightPair);
    }
    return group;
  }

  function createDNA() {
    const { backbones } = config.colors;
    let dnaSequence = config.dna.sequence;
    if (!dnaSequence) {
      dnaSequence = generateRandomSequence(config.dna.sequenceLength);
    }
    const backbone1 = createBackbone(0, backbones.primary);
    const backbone2 = createBackbone(Math.PI, backbones.secondary);
    const basePairs = createBasePairs(dnaSequence);

    scene.add(backbone1);
    scene.add(backbone2);
    scene.add(basePairs);
  }

  function updateRotation() {
    const { rotationSpeed, damping } = config.animation;
    rotationVelocity.x = (targetRotation.x - currentRotation.x) * rotationSpeed;
    currentRotation.x += rotationVelocity.x;
    rotationVelocity.x *= damping;
    scene.rotation.x = currentRotation.x;
    scene.rotation.z = Math.PI / 2;
  }

  function animate() {
    animationFrameRequestId = requestAnimationFrame(animate);
    updateRotation();
    renderer?.render(scene, camera);
  }

  const handleMouseMove = (event) => {
    if (!containerRef) return;

    const rect = containerRef.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    targetRotation.x =
      (offsetX / rect.width - 0.5) * Math.PI * 2 + (offsetY / rect.height - 0.5) * Math.PI * 3.5;
  };

  function cleanupDNA() {
    if (scene) {
      while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
      }
    }
  }

  // Setup the component lifecycle
  onMount(() => {
    applyProps();
    setup();
    createScene();
    createDNA();
    animate();

    // Setup event listeners
    document.body.addEventListener("mousemove", handleMouseMove);

    // Setup resize observer
    resizeObserver = new ResizeObserver(onResize);
    containerRef && resizeObserver?.observe(containerRef);
  });

  // Cleanup on component unmount
  onCleanup(() => {
    document.body.removeEventListener("mousemove", handleMouseMove);

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    if (animationFrameRequestId) {
      cancelAnimationFrame(animationFrameRequestId);
    }

    if (renderer) {
      renderer.dispose();
    }
  });

  createEffect(() => {
    applyProps();
    cleanupDNA();
    createDNA();
  });

  return html`<div
    ref=${(el) => (containerRef = el)}
    style=${props.style || "width:100%; height:100%;"}
    class=${props.class || ""}
  >
    <canvas
      ref=${(el) => (canvasRef = el)}
      style=${props.canvasStyle ||
      "width:100%; height:100%; mask-image: radial-gradient(ellipse at center, black 0%, transparent 100%);"}
    />
  </div>`;
}
