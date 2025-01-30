import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

(function() {
  const canvas = document.getElementById("dnaCanvas");
  
  // Enhanced renderer settings
  const renderer = new THREE.WebGLRenderer({ 
    canvas: canvas, 
    antialias: true,
    powerPreference: "high-performance",
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Scene with atmospheric fog
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080814); // Deeper, richer background
  scene.fog = new THREE.FogExp2(0x080814, 0.015);

  // Enhanced camera settings
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 35);

  // Advanced lighting setup
  const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
  mainLight.position.set(10, 10, 10);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  scene.add(mainLight);

  // Dynamic colored point lights
  const pointLights = [
    new THREE.PointLight(0x4ca5ff, 2, 50), // Blue
    new THREE.PointLight(0xff6b6b, 2, 50), // Red
    new THREE.PointLight(0x7ee8fa, 2, 50)  // Cyan
  ];
  
  pointLights[0].position.set(-5, 5, 5);
  pointLights[1].position.set(5, -5, -5);
  pointLights[2].position.set(0, 0, 10);
  pointLights.forEach(light => scene.add(light));

  // Modern color palette
  const colors = {
    backbone1: 0x4ca5ff,     // Bright blue
    backbone2: 0xff6b6b,     // Coral red
    basePairs: 0xf8f9fa,     // Off-white
    highlight: 0x7ee8fa,     // Cyan highlight
    emission1: 0x00ff88,     // Neon green
    emission2: 0xff00ff      // Magenta
  };

  // Enhanced materials with subsurface scattering and emission
  const createBackboneMaterial = (color, emissiveColor) => {
    return new THREE.MeshPhysicalMaterial({
      color: color,
      metalness: 0.3,
      roughness: 0.2,
      transmission: 0.2,
      thickness: 0.5,
      envMapIntensity: 1.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.1,
      emissive: emissiveColor,
      emissiveIntensity: 0.5
    });
  };

  const createBasePairMaterial = () => {
    return new THREE.MeshPhysicalMaterial({
      color: colors.basePairs,
      metalness: 0.4,
      roughness: 0.2,
      transmission: 0.4,
      thickness: 0.5,
      envMapIntensity: 1.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.1
    });
  };

  // Enhanced helix geometry
  function helixFunction(t, turns = 3, height = 20, radius = 2, phase = 0) {
    const angle = 2 * Math.PI * turns * t + phase;
    const y = -height / 2 + height * t;
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    return new THREE.Vector3(x, y, z);
  }

  function createBackbone(turns, height, radius, phase, color, emissiveColor) {
    const numPoints = 400; // Increased for ultra-smooth curves
    
    class DNAHelixCurve extends THREE.Curve {
      getPoint(t) {
        return helixFunction(t, turns, height, radius, phase);
      }
    }

    const helixCurve = new DNAHelixCurve();
    // Thicker, more substantial backbone
    const tubeGeometry = new THREE.TubeGeometry(helixCurve, numPoints, 0.3, 16, false);
    const tubeMaterial = createBackboneMaterial(color, emissiveColor);
    return new THREE.Mesh(tubeGeometry, tubeMaterial);
  }

  // Create backbones with improved parameters
  const turns = 2;
  const height = 48;
  const radius = 3;
  
  const backbone1 = createBackbone(turns, height, radius, 0, colors.backbone1, colors.emission1);
  const backbone2 = createBackbone(turns, height, radius, Math.PI, colors.backbone2, colors.emission2);

  scene.add(backbone1);
  scene.add(backbone2);

  // Enhanced base pairs with modern geometry
  function createBasePairs() {
    const numPairs = height / turns;
    const geometryList = new THREE.Group();
    const basePairMaterial = createBasePairMaterial();

    for (let i = 0; i <= numPairs; i++) {
      const t = i / numPairs;
      const p1 = helixFunction(t, turns, height, radius, 0);
      const p2 = helixFunction(t, turns, height, radius, Math.PI);

      // Create a merged geometry for each base pair
      const distance = p1.distanceTo(p2);
      const baseGeometry = new THREE.CylinderGeometry(0.15, 0.15, distance * 0.8, 12, 1, true);
      const capGeometry1 = new THREE.SphereGeometry(0.15, 12, 12);
      const capGeometry2 = new THREE.SphereGeometry(0.15, 12, 12);

      // Position the caps
      capGeometry1.translate(0, distance * 0.4, 0);
      capGeometry2.translate(0, -distance * 0.4, 0);

      // Merge geometries
      const mergedGeometry = BufferGeometryUtils.mergeGeometries([
        baseGeometry,
        capGeometry1,
        capGeometry2
      ]);

      const bar = new THREE.Mesh(mergedGeometry, basePairMaterial);

      const midpoint = p1.clone().add(p2).multiplyScalar(0.5);
      bar.position.copy(midpoint);

      const direction = new THREE.Vector3().subVectors(p2, p1);
      const orientation = new THREE.Quaternion();
      orientation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      bar.applyQuaternion(orientation);

      geometryList.add(bar);
    }
    return geometryList;
  }

  const basePairs = createBasePairs();
  scene.add(basePairs);

  // Smooth camera controls with inertia
  const targetRotation = { x: 0, y: 0 };
  const currentRotation = { x: 0, y: 0 };
  const rotationVelocity = { x: 0, y: 0 };
  const damping = 0.95;
  
  window.addEventListener('mousemove', (event) => {
    targetRotation.x = (event.clientY / window.innerHeight - 0.5) * Math.PI * 0.5;
    targetRotation.y = (event.clientX / window.innerWidth - 0.5) * Math.PI * 2;
  });

  window.addEventListener('resize', onWindowResize, false);
  function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);

    // Smooth rotation with inertia
    rotationVelocity.x = (targetRotation.x - currentRotation.x) * 0.05;
    rotationVelocity.y = (targetRotation.y - currentRotation.y) * 0.05;
    
    currentRotation.x += rotationVelocity.x;
    currentRotation.y += rotationVelocity.y;
    
    rotationVelocity.x *= damping;
    rotationVelocity.y *= damping;

    scene.rotation.x = currentRotation.x;
    scene.rotation.y = currentRotation.y;

    // Dynamic animations
    const time = Date.now() * 0.001;
    
    // Gentle floating motion
    scene.position.y = Math.sin(time * 0.5) * 0.5;
    
    // Animate point lights
    pointLights.forEach((light, index) => {
      const offset = index * (Math.PI * 2 / 3);
      light.intensity = 1.5 + Math.sin(time * 2 + offset) * 0.5;
      light.position.x = Math.sin(time + offset) * 5;
      light.position.z = Math.cos(time + offset) * 5;
    });

    renderer.render(scene, camera);
  }

  animate();
})();