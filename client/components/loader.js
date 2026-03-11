import { onCleanup, onMount } from "solid-js";
import html from "solid-js/html";

const CONFIG = {
  sequenceLength: 30,
  turns: 2,
  height: 80,
  radius: 3,
  backboneThickness: 0.3,
  baseRadius: 0.25,
  baseGap: 0.15,
  cameraZ: 40,
  fov: 10,
  colors: {
    A: { color: "#ff6b6b", pair: "#4ca5ff" },
    T: { color: "#4ca5ff", pair: "#ff6b6b" },
    C: { color: "#7bed9f", pair: "#ffa502" },
    G: { color: "#ffa502", pair: "#7bed9f" },
    backbones: ["#2e8bc0", "#145da0"],
  },
};

export default function DNASpinner(props) {
  let containerRef, svgRef, animationId;
  let targetTwist = 0,
    currentTwist = 0,
    twistVelocity = 0,
    autoSpin = 0;
  let elements3D = [];

  function generateElements() {
    elements3D = [];
    const { turns, height, radius, backboneThickness, baseRadius, baseGap } = CONFIG;
    const bases = ["A", "T", "C", "G"];

    const getPoint = (t, phase, r) => {
      const angle = 2 * Math.PI * turns * t + phase;
      return {
        x: -height / 2 + height * t,
        y: r * Math.cos(angle),
        z: r * Math.sin(angle),
      };
    };

    for (let j = 0; j < 2; j++) {
      const phase = j * Math.PI;
      for (let i = 0; i < 199; i++) {
        elements3D.push({
          p1: getPoint(i / 199, phase, radius),
          p2: getPoint((i + 1) / 199, phase, radius),
          color: CONFIG.colors.backbones[j],
          width: backboneThickness * 2,
          type: "backbone",
        });
      }
    }

    const outerR = radius - backboneThickness;
    const innerR = baseGap / 2 + baseRadius;

    for (let i = 0; i < CONFIG.sequenceLength; i++) {
      const t = i / CONFIG.sequenceLength;
      const nucleotide = CONFIG.colors[bases[Math.floor(Math.random() * bases.length)]];
      elements3D.push({
        p1: getPoint(t, 0, outerR),
        p2: getPoint(t, 0, innerR),
        color: nucleotide.color,
        width: baseRadius * 2,
        type: "rung",
      });
      elements3D.push({
        p1: getPoint(t, Math.PI, outerR),
        p2: getPoint(t, Math.PI, innerR),
        color: nucleotide.pair,
        width: baseRadius * 2,
        type: "rung",
      });
    }
  }

  function project(p, twistAngle) {
    const y = p.y * Math.cos(twistAngle) - p.z * Math.sin(twistAngle);
    const z = p.y * Math.sin(twistAngle) + p.z * Math.cos(twistAngle);
    const focalLength = 1 / Math.tan((CONFIG.fov * Math.PI) / 180 / 2);
    const scale = focalLength / -(z - CONFIG.cameraZ);
    return { x: 500 + p.x * scale * 500, y: 500 - y * scale * 500, z, scale };
  }

  function renderSVG() {
    if (!svgRef) return;

    const projected = elements3D.map((el) => {
      const p1 = project(el.p1, currentTwist);
      const p2 = project(el.p2, currentTwist);
      return {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        z: el.type === "rung" ? p1.z - 1.0 : (p1.z + p2.z) / 2,
        width: el.width * ((p1.scale + p2.scale) / 2) * 500,
        color: el.color,
      };
    });

    projected.sort((a, b) => a.z - b.z);

    let htmlString = "";
    for (const l of projected) {
      htmlString += `<line x1="${l.x1.toFixed(1)}" y1="${l.y1.toFixed(1)}" x2="${l.x2.toFixed(1)}" y2="${l.y2.toFixed(1)}" stroke="${l.color}" stroke-width="${l.width.toFixed(1)}" stroke-linecap="round"/>`;
    }
    svgRef.innerHTML = htmlString;
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    autoSpin -= 0.005;
    twistVelocity += (autoSpin + targetTwist - currentTwist) * 0.0008;
    twistVelocity *= 0.9;
    currentTwist += twistVelocity;
    renderSVG();
  }

  const handleMouse = (e) => {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    targetTwist = -((e.clientX - rect.left) / rect.width - 0.5) * Math.PI * 4;
  };

  onMount(() => {
    generateElements();
    animate();
    document.body.addEventListener("mousemove", handleMouse);
  });

  onCleanup(() => {
    document.body.removeEventListener("mousemove", handleMouse);
    cancelAnimationFrame(animationId);
  });

  return html`<div
    ref=${(el) => (containerRef = el)}
    style=${props.style || "width:100%; height:100%;"}
    class=${props.class || ""}
  >
    <svg
      ref=${(el) => (svgRef = el)}
      viewBox="0 0 1000 1000"
      style="width:100%; height:100%; mask-image: radial-gradient(ellipse at center, black 0%, transparent 100%); -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 100%);"
    ></svg>
  </div>`;
}
