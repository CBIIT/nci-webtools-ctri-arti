import html from "solid-js/html";
import "./projects.css";
import { createSignal, onMount } from "solid-js";
import { getProjects, addProject, deleteProject } from "../services/projects.js";

export default function Projects() {
  const [projects, setProjects] = createSignal([]);
  const [newProject, setNewProject] = createSignal("");

  onMount(async () => {
    const projects = await getProjects();
    setProjects(projects);
  });

  const handleAdd = async () => {
    if (newProject().trim()) {
      await addProject({ name: newProject().trim() });
      setProjects(await getProjects());
      setNewProject("");
    }
  };

  const handleDelete = async (id) => {
    await deleteProject(id);
    setProjects(await getProjects());
  };

  return html`
    <div class="projects-page">
      <h1>Projects</h1>
      
      <div class="add-project">
        <input
          type="text"
          value=${newProject()}
          onInput=${(e) => setNewProject(e.target.value)}
          placeholder="New project name"
        />
        <button onClick=${handleAdd}>Add Project</button>
      </div>

      <ul class="project-list">
        ${projects().map(project => html`
          <li>
            <span>${project.name}</span>
            <button onClick=${() => handleDelete(project.id)}>Delete</button>
          </li>
        `)}
      </ul>
    </div>
  `;
}
