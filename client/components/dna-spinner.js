import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js";

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
    rotationSpeed: 0.0015,
  },
  camera: {
    fov: 10,
    near: 0.01,
    far: 150,
    position: { x: 0, y: 0, z: 40 },
  },
};

export class DNASpinnerComponent extends HTMLElement {
  static get observedAttributes() {
    return ["sequence", "rotation-speed", "turns", "height", "radius", "backbone-thickness", "base-radius", "base-gap"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    // Create a canvas that fills the host element.
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.maskImage = "radial-gradient(ellipse at center, black 0%, transparent 100%)";
    this.canvas.style.webkitMaskImage = this.canvas.style.maskImage;
    this.shadowRoot.appendChild(this.canvas);

    // Observe changes to the component's size.
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this);

    // Make a deep copy of the default config.
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    // Override defaults with any attributes provided.
    this.applyAttributes();

    // Setup the Three.js scene.
    this.setup();
    this.createScene();
    this.createDNA();
    this.setupEventListeners();
    this.animate();
  }

  applyAttributes() {
    if (this.hasAttribute("sequence")) {
      this.config.dna.sequence = this.getAttribute("sequence");
    }
    if (this.hasAttribute("rotation-speed")) {
      this.config.animation.rotationSpeed = parseFloat(this.getAttribute("rotation-speed"));
    }
    if (this.hasAttribute("turns")) {
      this.config.dna.turns = parseFloat(this.getAttribute("turns"));
    }
    if (this.hasAttribute("height")) {
      this.config.dna.height = parseFloat(this.getAttribute("height"));
    }
    if (this.hasAttribute("radius")) {
      this.config.dna.radius = parseFloat(this.getAttribute("radius"));
    }
    if (this.hasAttribute("backbone-thickness")) {
      this.config.dna.backboneThickness = parseFloat(this.getAttribute("backbone-thickness"));
    }
    if (this.hasAttribute("base-radius")) {
      this.config.dna.baseRadius = parseFloat(this.getAttribute("base-radius"));
    }
    if (this.hasAttribute("base-gap")) {
      this.config.dna.baseGap = parseFloat(this.getAttribute("base-gap"));
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // Re-apply attributes and recreate the DNA visualization.
    this.applyAttributes();
    if (this.scene) {
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]);
      }
      this.createDNA();
    }
  }

  onResize() {
    const rect = this.getBoundingClientRect();
    if (this.renderer && this.camera) {
      this.renderer.setSize(rect.width, rect.height);
      this.camera.aspect = rect.width / rect.height;
      this.camera.updateProjectionMatrix();
    }
  }

  setup() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    const rect = this.getBoundingClientRect();
    this.renderer.setSize(rect.width || window.innerWidth, rect.height || window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);

    const { fov, near, far, position } = this.config.camera;
    this.camera = new THREE.PerspectiveCamera(fov, rect.width / rect.height, near, far);
    this.camera.position.set(position.x, position.y, position.z);

    this.targetRotation = { x: 0, y: 0 };
    this.currentRotation = { x: 0, y: 0 };
    this.rotationVelocity = { x: 0, y: 0 };
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff));
  }

  generateRandomSequence(length) {
    const bases = Object.keys(this.config.colors.nucleotides);
    let seq = "";
    for (let i = 0; i < length; i++) {
      seq += bases[Math.floor(Math.random() * bases.length)];
    }
    return seq;
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
      const baseInfo = nucleotideColors[base] || nucleotideColors["A"];

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
    let dnaSequence = this.config.dna.sequence;
    if (!dnaSequence) {
      dnaSequence = this.generateRandomSequence(this.config.dna.sequenceLength);
    }
    const backbone1 = this.createBackbone(0, backbones.primary);
    const backbone2 = this.createBackbone(Math.PI, backbones.secondary);
    const basePairs = this.createBasePairs(dnaSequence);

    this.scene.add(backbone1);
    this.scene.add(backbone2);
    this.scene.add(basePairs);
  }

  setupEventListeners() {
    this.mouseMoveListener = (event) => {
      const rect = this.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      this.targetRotation.x = (offsetX / rect.width - 0.5) * Math.PI * 2 + (offsetY / rect.height - 0.5) * Math.PI * 3.5;
    };
    this.shadowRoot.addEventListener("mousemove", this.mouseMoveListener);
  }

  updateRotation() {
    const { rotationSpeed, damping } = this.config.animation;
    this.rotationVelocity.x = (this.targetRotation.x - this.currentRotation.x) * rotationSpeed;

    this.currentRotation.x += this.rotationVelocity.x;
    this.rotationVelocity.x *= damping;

    this.scene.rotation.x = this.currentRotation.x;
    this.scene.rotation.z = Math.PI / 2;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.updateRotation();
    this.renderer.render(this.scene, this.camera);
  }
}

customElements.define("dna-spinner", DNASpinnerComponent);
