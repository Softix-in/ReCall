import {
  createProject,
  deleteProject,
  reorderProjects,
  updateProject,
} from '../../shared/api.js';
import { createBulletEditor } from '../components/bullet-editor.js';
import { createTagInput } from '../components/tag-input.js';
import { renderProjectCard } from '../components/project-card.js';
import {
  renderEmptyState,
} from '../components/copy-button.js';

export function mountProjectsTab(container, ctx) {
  container.innerHTML = `
    <section class="panel-card">
      <div class="panel-card-header">
        <h2>Projects</h2>
        <button type="button" class="btn btn-primary" id="projects-add-btn">+ Add project</button>
      </div>
      <div id="projects-list" class="projects-list"></div>
      <div id="project-form-panel" class="project-form-panel" hidden>
        <h3 id="project-form-title">Add project</h3>
        <div class="field-block">
          <label class="field-label" for="project-name">Name</label>
          <input id="project-name" class="text-input" type="text" placeholder="Project name" />
        </div>
        <div class="field-block">
          <label class="field-label" for="project-tagline">Tagline</label>
          <input id="project-tagline" class="text-input" type="text" placeholder="One-line summary" />
        </div>
        <div class="field-block">
          <label class="field-label" for="project-description">Description</label>
          <textarea id="project-description" class="text-area" rows="3" placeholder="What did you build?"></textarea>
        </div>
        <div class="field-block">
          <label class="field-label">Tech stack</label>
          <div id="project-tech"></div>
        </div>
        <div class="field-block">
          <label class="field-label">Impact bullets</label>
          <div id="project-bullets"></div>
        </div>
        <div class="field-grid two-col">
          <div class="field-block">
            <label class="field-label" for="project-github">GitHub URL</label>
            <input id="project-github" class="text-input" type="text" />
          </div>
          <div class="field-block">
            <label class="field-label" for="project-live">Live URL</label>
            <input id="project-live" class="text-input" type="text" />
          </div>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" id="project-featured" />
          Featured project
        </label>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="project-cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="project-save-btn">Save project</button>
        </div>
        <p class="inline-error" id="project-form-error" hidden></p>
      </div>
    </section>
  `;

  const listEl = container.querySelector('#projects-list');
  const formPanel = container.querySelector('#project-form-panel');
  const formTitle = container.querySelector('#project-form-title');
  const formError = container.querySelector('#project-form-error');
  const nameInput = container.querySelector('#project-name');
  const taglineInput = container.querySelector('#project-tagline');
  const descriptionInput = container.querySelector('#project-description');
  const githubInput = container.querySelector('#project-github');
  const liveInput = container.querySelector('#project-live');
  const featuredInput = container.querySelector('#project-featured');

  const techControl = createTagInput({
    placeholder: 'Add technology',
    onChange: () => {},
  });
  container.querySelector('#project-tech').appendChild(techControl.element);

  const bulletControl = createBulletEditor({ bullets: [''] });
  container.querySelector('#project-bullets').appendChild(bulletControl.element);

  let projects = [];
  let editingId = null;

  function getFormPayload() {
    return {
      name: nameInput.value.trim(),
      tagline: taglineInput.value.trim() || null,
      description: descriptionInput.value.trim() || null,
      tech_stack: techControl.getValues(),
      impact_bullets: bulletControl.getBullets(),
      github_url: githubInput.value.trim() || null,
      live_url: liveInput.value.trim() || null,
      is_featured: featuredInput.checked,
    };
  }

  function resetForm() {
    editingId = null;
    formTitle.textContent = 'Add project';
    nameInput.value = '';
    taglineInput.value = '';
    descriptionInput.value = '';
    githubInput.value = '';
    liveInput.value = '';
    featuredInput.checked = false;
    techControl.setValues([]);
    bulletControl.setBullets(['']);
    formError.hidden = true;
    formPanel.hidden = true;
  }

  function openCreateForm() {
    editingId = null;
    formTitle.textContent = 'Add project';
    formPanel.hidden = false;
    nameInput.focus();
  }

  function openEditForm(project) {
    editingId = project.id;
    formTitle.textContent = 'Edit project';
    nameInput.value = project.name || '';
    taglineInput.value = project.tagline || '';
    descriptionInput.value = project.description || '';
    githubInput.value = project.github_url || '';
    liveInput.value = project.live_url || '';
    featuredInput.checked = Boolean(project.is_featured);
    techControl.setValues(project.tech_stack || []);
    bulletControl.setBullets(project.impact_bullets?.length ? project.impact_bullets : ['']);
    formPanel.hidden = false;
    formError.hidden = true;
  }

  async function persistOrder(nextProjects) {
    const orderedIds = nextProjects.map((project) => project.id);
    const result = await reorderProjects(orderedIds);
    projects = result.projects || [];
    ctx.setProjects(projects);
    renderList();
  }

  function moveProject(project, direction) {
    const index = projects.findIndex((entry) => entry.id === project.id);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= projects.length) {
      return;
    }

    const next = [...projects];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    projects = next;
    renderList();

    persistOrder(next).catch((error) => {
      ctx.showToast(error.message || 'Failed to reorder projects', 'error');
      projects = ctx.getProjects();
      renderList();
    });
  }

  function renderList() {
    listEl.innerHTML = '';

    if (projects.length === 0) {
      listEl.appendChild(renderEmptyState('No projects yet. Add your first project to tailor applications later.'));
      return;
    }

    projects.forEach((project, index) => {
      listEl.appendChild(renderProjectCard(project, {
        isFirst: index === 0,
        isLast: index === projects.length - 1,
        onEdit: openEditForm,
        onDelete: async (entry) => {
          if (!window.confirm(`Delete project "${entry.name}"?`)) {
            return;
          }

          try {
            await deleteProject(entry.id);
            projects = projects.filter((item) => item.id !== entry.id);
            ctx.setProjects(projects);
            renderList();
            ctx.showToast('Project deleted');
          } catch (error) {
            ctx.showToast(error.message || 'Failed to delete project', 'error');
          }
        },
        onMoveUp: (entry) => moveProject(entry, -1),
        onMoveDown: (entry) => moveProject(entry, 1),
      }));
    });
  }

  container.querySelector('#projects-add-btn').addEventListener('click', openCreateForm);
  container.querySelector('#project-cancel-btn').addEventListener('click', resetForm);

  container.querySelector('#project-save-btn').addEventListener('click', async () => {
    formError.hidden = true;
    const payload = getFormPayload();

    if (!payload.name) {
      formError.textContent = 'Project name is required';
      formError.hidden = false;
      return;
    }

    try {
      if (editingId) {
        const result = await updateProject(editingId, payload);
        projects = projects.map((project) => (
          project.id === editingId ? result.project : project
        ));
        ctx.setProjects(projects);
        ctx.showToast('Project updated');
      } else {
        const result = await createProject(payload);
        projects = [...projects, result.project];
        ctx.setProjects(projects);
        ctx.showToast('Project added');
      }

      resetForm();
      renderList();
    } catch (error) {
      formError.textContent = error.message || 'Failed to save project';
      formError.hidden = false;
      ctx.showToast(error.message || 'Failed to save project', 'error');
    }
  });

  function refresh(nextProjects) {
    projects = [...(nextProjects || [])];
    renderList();
  }

  refresh(ctx.getProjects());

  return { refresh };
}
