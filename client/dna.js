import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

(function () {
  
        // Generate random DNA sequence
        function generateRandomSequence(length) {
          const bases = ['A', 'T', 'C', 'G'];
          let sequence = '';
          for (let i = 0; i < length; i++) {
              sequence += bases[Math.floor(Math.random() * bases.length)];
          }
          return sequence;
      }

      // Generate a random sequence of 20 bases
      const dnaSequence = generateRandomSequence(20);
      console.log(`DNA Sequence: ${dnaSequence}`);

      const canvas = document.getElementById("dnaCanvas");

      // Enhanced renderer settings
      const renderer = new THREE.WebGLRenderer({
          canvas: canvas,
          antialias: true,
          alpha: true,
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Scene setup
      const scene = new THREE.Scene();
      // scene.background = new THREE.Color(0x0c2d48); // Dark Blue
      scene.fog = new THREE.FogExp2(0x000814, 0.012);

      // Camera settings
      const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 0, 32);

      // Lighting setup
      const ambientLight = new THREE.AmbientLight(0x101820, 0.3);
      scene.add(ambientLight);

      // Main spotlight
      const mainSpot = new THREE.SpotLight(0xffffff, 2);
      mainSpot.position.set(15, 15, 15);
      mainSpot.angle = Math.PI / 4;
      mainSpot.penumbra = 0.3;
      mainSpot.decay = 1.5;
      mainSpot.distance = 100;
      mainSpot.castShadow = true;
      scene.add(mainSpot);

      // Dynamic colored point lights
      const pointLights = [
          new THREE.PointLight(0x145da0, 3, 40), // Midnight Blue
          new THREE.PointLight(0x2e8bc0, 3, 40), // Blue
          new THREE.PointLight(0xb1d4e0, 3, 40), // Baby Blue
          new THREE.PointLight(0x5885af, 3, 40), // Blue Gray
      ];

      pointLights[0].position.set(-5, 5, 5);
      pointLights[1].position.set(5, -5, -5);
      pointLights[2].position.set(0, 0, 10);
      pointLights[3].position.set(-3, 3, -5);
      pointLights.forEach(light => scene.add(light));

      // DNA sequence color mapping
      const nucleotideColors = {
          'A': { color: 0xff6b6b, pair: 'T', pairColor: 0x4ca5ff },
          'T': { color: 0x4ca5ff, pair: 'A', pairColor: 0xff6b6b },
          'C': { color: 0x7bed9f, pair: 'G', pairColor: 0xffa502 },
          'G': { color: 0xffa502, pair: 'C', pairColor: 0x7bed9f }
      };

      // Materials
      const createBackboneMaterial = (color, emissiveColor) => {
          return new THREE.MeshPhysicalMaterial({
              color: color,
              metalness: 0.4,
              roughness: 0.15,
              transmission: 0.25,
              thickness: 0.5,
              clearcoat: 0.8,
              clearcoatRoughness: 0.1,
              emissive: emissiveColor,
              emissiveIntensity: 0.8,
          });
      };

      // Helix geometry functions
      function helixFunction(t, turns = 3, height = 20, radius = 2, phase = 0) {
          const angle = 2 * Math.PI * turns * t + phase;
          const y = -height / 2 + height * t;
          const x = radius * Math.cos(angle);
          const z = radius * Math.sin(angle);
          return new THREE.Vector3(x, y, z);
      }

      function createBackbone(turns, height, radius, phase, color, emissiveColor) {
          const numPoints = 400;
          const curve = new THREE.Curve();
          curve.getPoint = (t) => helixFunction(t, turns, height, radius, phase);
          
          const tubeGeometry = new THREE.TubeGeometry(curve, numPoints, 0.3, 16, false);
          const tubeMaterial = createBackboneMaterial(color, emissiveColor);
          return new THREE.Mesh(tubeGeometry, tubeMaterial);
      }

      // Create DNA structure
      const turns = 2;
      const height = 48;
      const radius = 3;

      const backbone1 = createBackbone(turns, height, radius, 0, 0x2e8bc0, 0xb1d4e0); // Blue to Baby Blue // Green
      const backbone2 = createBackbone(turns, height, radius, Math.PI, 0x145da0, 0x5885af); // Midnight Blue to Blue Gray // Magenta

      scene.add(backbone1);
      scene.add(backbone2);

      // Create base pairs based on sequence
      function createBasePairs() {
          const group = new THREE.Group();
          const numPairs = dnaSequence.length;
          const baseRadius = 0.1;
          const gap = 0.15;

          for (let i = 0; i < numPairs; i++) {
              const t = i / numPairs;
              const base = dnaSequence[i];
              const baseInfo = nucleotideColors[base];

              const p1 = helixFunction(t, turns, height, radius, 0);
              const p2 = helixFunction(t, turns, height, radius, Math.PI);
              
              const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
              const totalDistance = p1.distanceTo(p2);
              const halfLength = (totalDistance - gap) / 2;

              // Create left base pair
              const leftGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius, halfLength, 16);
              leftGeometry.translate(0, halfLength / 2, 0);
              const leftMaterial = new THREE.MeshPhysicalMaterial({
                  color: baseInfo.color,
                  metalness: 0.3,
                  roughness: 0.2,
                  transmission: 0.15,
                  emissive: baseInfo.color,
                  emissiveIntensity: 0.5,
              });
              const leftPair = new THREE.Mesh(leftGeometry, leftMaterial);
              leftPair.position.copy(p1);

              // Create right base pair
              const rightGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius, halfLength, 16);
              rightGeometry.translate(0, halfLength / 2, 0);
              const rightMaterial = new THREE.MeshPhysicalMaterial({
                  color: baseInfo.pairColor,
                  metalness: 0.3,
                  roughness: 0.2,
                  transmission: 0.15,
                  emissive: baseInfo.pairColor,
                  emissiveIntensity: 0.5,
              });
              const rightPair = new THREE.Mesh(rightGeometry, rightMaterial);
              rightPair.position.copy(p2);

              // Calculate rotations
              const toCenter = new THREE.Vector3().subVectors(center, p1).normalize();
              const quaternion = new THREE.Quaternion().setFromUnitVectors(
                  new THREE.Vector3(0, 1, 0),
                  toCenter
              );
              leftPair.setRotationFromQuaternion(quaternion);
              
              const toCenterRight = new THREE.Vector3().subVectors(center, p2).normalize();
              const quaternionRight = new THREE.Quaternion().setFromUnitVectors(
                  new THREE.Vector3(0, 1, 0),
                  toCenterRight
              );
              rightPair.setRotationFromQuaternion(quaternionRight);

              group.add(leftPair);
              group.add(rightPair);
          }
          return group;
      }

      const basePairs = createBasePairs();
      scene.add(basePairs);

      // Smooth camera controls
      const targetRotation = { x: 0, y: 0 };
      const currentRotation = { x: 0, y: 0 };
      const rotationVelocity = { x: 0, y: 0 };
      const damping = 0.95;

      window.addEventListener('mousemove', (event) => {
          targetRotation.x = (event.clientY / window.innerHeight - 0.5) * Math.PI * 0.5;
          targetRotation.y = (event.clientX / window.innerWidth - 0.5) * Math.PI * 2;
      });

      window.addEventListener('resize', () => {
          const width = window.innerWidth;
          const height = window.innerHeight;
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
      });

      function animate() {
          requestAnimationFrame(animate);

          rotationVelocity.x = (targetRotation.x - currentRotation.x) * 0.05;
          rotationVelocity.y = (targetRotation.y - currentRotation.y) * 0.05;

          currentRotation.x += rotationVelocity.x;
          currentRotation.y += rotationVelocity.y;

          rotationVelocity.x *= damping;
          rotationVelocity.y *= damping;

          scene.rotation.x = currentRotation.x;
          scene.rotation.y = currentRotation.y;

          const time = Date.now() * 0.001;

          scene.position.y = Math.sin(time * 0.4) * 0.6;
          scene.position.x = Math.sin(time * 0.3) * 0.3;

          // Animate point lights
          pointLights.forEach((light, index) => {
              const offset = index * (Math.PI * 2 / pointLights.length);
              light.intensity = 2 + Math.sin(time * 2 + offset) * 1;
              light.position.x = Math.sin(time + offset) * 6;
              light.position.z = Math.cos(time + offset) * 6;
              light.position.y = Math.sin(time * 0.5 + offset) * 3;
          });

          renderer.render(scene, camera);
      }

      animate();
})();
