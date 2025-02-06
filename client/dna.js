import * as THREE from "three";

const CONFIG = {
  dna: {
    sequenceLength: 20,
    turns: 2,
    height: 48,
    radius: 3,
    backboneThickness: 0.3,
    baseRadius: 0.1,
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
    }
  },
  animation: {
    damping: 0.95,
    rotationSpeed: 0.05,
  },
  camera: {
    fov: 65,
    near: 0.1,
    far: 1000,
    position: { x: 0, y: 0, z: 32 },
  }
};

class DNAVisualizer {
  constructor(canvasSelector, config = CONFIG) {
    this.config = config;
    this.canvas = document.querySelector(canvasSelector);
    this.setup();
    this.createScene();
    this.createDNA();
    this.setupEventListeners();
    this.animate();
  }

  setup() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1);

    const { fov, near, far, position } = this.config.camera;
    this.camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
    this.camera.position.set(position.x, position.y, position.z);

    this.targetRotation = { x: 0, y: 0 };
    this.currentRotation = { x: 0, y: 0 };
    this.rotationVelocity = { x: 0, y: 0 };
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff));
    return this.scene;
  }

  generateRandomSequence(length) {
    const bases = Object.keys(this.config.colors.nucleotides);
    return Array.from({ length }, () => bases[Math.floor(Math.random() * bases.length)]).join("");
  }

  createBackboneMaterial(color) {
    return new THREE.MeshBasicMaterial({ color });
  }

  helixFunction(t, phase = 0) {
    const { turns, height, radius } = this.config.dna;
    const angle = 2 * Math.PI * turns * t + phase;
    const y = -height / 2 + height * t;
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    return new THREE.Vector3(x, y, z);
  }

  createBackbone(phase, color) {
    const numPoints = 200; 
    const curve = new THREE.Curve();
    curve.getPoint = (t) => this.helixFunction(t, phase);

    const tubeGeometry = new THREE.TubeGeometry(curve, numPoints, this.config.dna.backboneThickness, 8, false);
    return new THREE.Mesh(tubeGeometry, this.createBackboneMaterial(color));
  }

  createBasePairs(sequence) {
    const group = new THREE.Group();
    const numPairs = sequence.length;
    const { baseRadius, baseGap } = this.config.dna;
    const nucleotideColors = this.config.colors.nucleotides;

    for (let i = 0; i < numPairs; i++) {
      const t = i / numPairs;
      const base = sequence[i];
      const baseInfo = nucleotideColors[base];

      const p1 = this.helixFunction(t, 0);
      const p2 = this.helixFunction(t, Math.PI);

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
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        mesh.setRotationFromQuaternion(quaternion);
      };

      alignToCenter(leftPair, p1, center);
      alignToCenter(rightPair, p2, center);

      group.add(leftPair);
      group.add(rightPair);
    }
    return group;
  }

  createDNA() {
    const { backbones } = this.config.colors;
    const dnaSequence = this.generateRandomSequence(this.config.dna.sequenceLength);

    const backbone1 = this.createBackbone(0, backbones.primary);
    const backbone2 = this.createBackbone(Math.PI, backbones.secondary);
    const basePairs = this.createBasePairs(dnaSequence);

    this.scene.add(backbone1);
    this.scene.add(backbone2);
    this.scene.add(basePairs);
  }

  setupEventListeners() {
    this.eventListeners = {
      mousemove: (event) => {
        this.targetRotation.x = (event.clientY / window.innerHeight - 0.5) * Math.PI * 0.5;
        this.targetRotation.y = (event.clientX / window.innerWidth - 0.5) * Math.PI * 2;
      },
      resize: () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
      },
    };

    Object.entries(this.eventListeners).forEach(([eventName, listener]) => {
      window.addEventListener(eventName, listener);
    });
  }

  updateRotation() {
    const { rotationSpeed, damping } = this.config.animation;
    this.rotationVelocity.x = (this.targetRotation.x - this.currentRotation.x) * rotationSpeed;
    this.rotationVelocity.y = (this.targetRotation.y - this.currentRotation.y) * rotationSpeed;

    this.currentRotation.x += this.rotationVelocity.x;
    this.currentRotation.y += this.rotationVelocity.y;

    this.rotationVelocity.x *= damping;
    this.rotationVelocity.y *= damping;

    this.scene.rotation.x = this.currentRotation.x;
    this.scene.rotation.y = this.currentRotation.y;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.updateRotation();
    this.renderer.render(this.scene, this.camera);
  }
}

const visualizer = new DNAVisualizer(`canvas[data-component="dna-visualizer"]`);