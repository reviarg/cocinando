/*
 * script.js – client-side logic for Cocinando.Life
 *
 * This script handles navigation rendering, authentication, recipe storage,
 * extraction via the backend server, and dynamic page initialization.
 */

(function () {
  const PAGE_SIZE = 20;
  const VIEW_MODE_KEY_PREFIX = 'recipesViewMode_';
  const viewState = {
    mode: 'card',
    sortColumn: 'dateAdded',
    sortDirection: 'asc',
    currentPage: 1,
    filters: {
      id: '',
      dateAdded: '',
      name: '',
      source: '',
      tags: ''
    }
  };
  /**
   * Initialise the correct page based on the data-page attribute on the body.
   */
  document.addEventListener('DOMContentLoaded', function () {
    renderNav();
    // Intercept navigation to add/view pages to enforce authentication
    document.querySelectorAll('a[href="add.html"]').forEach(link => {
      link.addEventListener('click', function (e) {
        localStorage.removeItem('editRecipeId');
        if (!localStorage.getItem('currentUser')) {
          e.preventDefault();
          localStorage.setItem('redirectAfterLogin', 'add.html');
          window.location.href = 'login.html';
        }
      });
    });
    document.querySelectorAll('a[href="view.html"]').forEach(link => {
      link.addEventListener('click', function (e) {
        if (!localStorage.getItem('currentUser')) {
          e.preventDefault();
          localStorage.setItem('redirectAfterLogin', 'view.html');
          window.location.href = 'login.html';
        }
      });
    });
    const page = document.body.dataset.page;
    switch (page) {
      case 'home':
        initHome();
        break;
      case 'add':
        initAdd();
        break;
      case 'view':
        initView();
        break;
      case 'login':
        initLogin();
        break;
      case 'signup':
        initSignup();
        break;
      default:
        break;
    }
  });

  /**
   * Render the navigation bar's user section based on authentication state.
   */
  function renderNav() {
    const userMenu = document.getElementById('user-menu');
    if (!userMenu) return;
    userMenu.innerHTML = '';
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      // Create user link with dropdown arrow
      const userLink = document.createElement('a');
      userLink.href = '#';
      userLink.textContent = currentUser + ' ▼';
      userLink.className = 'user-link';
      userMenu.appendChild(userLink);
      // Dropdown container
      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown';
      // Logout option
      const logoutLink = document.createElement('a');
      logoutLink.href = '#';
      logoutLink.textContent = 'Log out';
      dropdown.appendChild(logoutLink);
      userMenu.appendChild(dropdown);
      // Toggle dropdown on click
      userLink.addEventListener('click', function (e) {
        e.preventDefault();
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
      });
      // Logout handler
      logoutLink.addEventListener('click', function (e) {
        e.preventDefault();
        localStorage.removeItem('currentUser');
        renderNav();
        window.location.href = 'index.html';
      });
      // Hide dropdown when clicking outside
      document.addEventListener('click', function handler(ev) {
        if (!userMenu.contains(ev.target)) {
          dropdown.style.display = 'none';
        }
      });
    } else {
      // Not logged in: show sign-up link
      const signUpLink = document.createElement('a');
      signUpLink.href = 'signup.html';
      signUpLink.textContent = 'Sign up';
      userMenu.appendChild(signUpLink);
    }
  }

  /**
   * Initialiser for the home page. Makes hero sections clickable.
   */
  function initHome() {
    // Home page buttons use standard links; authentication is enforced on the
    // destination pages (add.html and view.html). No extra logic needed here.
  }

  /**
   * Initialiser for the login page.
   */
  function initLogin() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (!username || !password) {
        alert('Please enter your username and password.');
        return;
      }
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      if (!users[username] || users[username] !== password) {
        alert('Invalid username or password.');
        return;
      }
      localStorage.setItem('currentUser', username);
      renderNav();
      const redirect = localStorage.getItem('redirectAfterLogin');
      if (redirect) {
        localStorage.removeItem('redirectAfterLogin');
        window.location.href = redirect;
      } else {
        window.location.href = 'index.html';
      }
    });
  }

  /**
   * Initialiser for the signup page.
   */
  function initSignup() {
    const form = document.getElementById('signup-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const username = document.getElementById('signup-username').value.trim();
      const password = document.getElementById('signup-password').value;
      if (!username || !password) {
        alert('Please fill in all fields.');
        return;
      }
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      if (users[username]) {
        alert('Username already exists.');
        return;
      }
      users[username] = password;
      localStorage.setItem('users', JSON.stringify(users));
      localStorage.setItem('currentUser', username);
      renderNav();
      const redirect = localStorage.getItem('redirectAfterLogin');
      if (redirect) {
        localStorage.removeItem('redirectAfterLogin');
        window.location.href = redirect;
      } else {
        window.location.href = 'index.html';
      }
    });
  }

  /**
   * Initialiser for the add recipe page.
   */
  function initAdd() {
    // Enforce authentication
    if (!localStorage.getItem('currentUser')) {
      localStorage.setItem('redirectAfterLogin', 'add.html');
      window.location.href = 'login.html';
      return;
    }
    // Always start with a clean form
    const form = document.getElementById('add-recipe-form');
    if (form) {
      form.reset();
      document.getElementById('recipe-source').value = '';
      document.getElementById('extracted-image').value = '';
    }
    // Determine if editing an existing recipe
    const editId = localStorage.getItem('editRecipeId');
    const pageTitle = document.querySelector('.page-title');
    // Populate fields accordingly
    const dateInput = document.getElementById('recipe-date');
    const now = new Date();
    dateInput.value = now.toLocaleDateString();
    if (editId) {
      // Change page title
      if (pageTitle) pageTitle.textContent = 'Edit Recipe';
      // Load recipe data
      const currentUser = localStorage.getItem('currentUser');
      const key = `recipes_${currentUser}`;
      const recipes = JSON.parse(localStorage.getItem(key) || '[]');
      const recipe = recipes.find(r => r.id == editId);
      if (recipe) {
        document.getElementById('recipe-url').value = recipe.url || '';
        document.getElementById('recipe-title').value = recipe.title || '';
        document.getElementById('recipe-source').value = recipe.source || '';
        document.getElementById('recipe-date').value = recipe.date || now.toLocaleDateString();
        document.getElementById('recipe-ingredients').value = (recipe.ingredients || []).join('\n');
        document.getElementById('recipe-steps').value = (recipe.steps || []).join('\n');
        document.getElementById('recipe-tags').value = (recipe.tags || []).join(', ');
        // Preserve existing image via hidden field
        if (recipe.image) {
          document.getElementById('extracted-image').value = recipe.image;
        }
        // We cannot prefill the image file input; skip.
      }
    }
    // Extract button handler
    const extractBtn = document.getElementById('extract-btn');
    if (extractBtn) {
      extractBtn.addEventListener('click', handleExtraction);
    }
    // Form submission
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        saveRecipe();
      });
    }
  }

  /**
   * Call the backend extraction endpoint to extract recipe details.
   */
  function handleExtraction() {
    const urlField = document.getElementById('recipe-url');
    const url = urlField.value.trim();
    if (!url) {
      alert('Please enter a recipe URL to extract.');
      return;
    }
    // Determine backend URL. Replace localhost with your deployed backend when needed.
    // Use deployed backend on Render. If running locally, you may adjust this URL.
    const backendUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:5000/extract'
      : 'https://cocinando.onrender.com/extract';
    fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    })
      .then(response => response.json())
      .then(data => {
        // Fill in fields with extracted data if available
        if (data.title) document.getElementById('recipe-title').value = data.title;
        document.getElementById('recipe-source').value = getSourceFromUrl(url);
        if (Array.isArray(data.ingredients)) {
          document.getElementById('recipe-ingredients').value = data.ingredients.join('\n');
        }
        if (Array.isArray(data.steps)) {
          document.getElementById('recipe-steps').value = data.steps.join('\n');
        }
        if (data.image) {
          document.getElementById('extracted-image').value = data.image;
        } else {
          document.getElementById('extracted-image').value = '';
        }
        // Suggest tags based on extracted data
        suggestTags({
          title: data.title || '',
          ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
          steps: Array.isArray(data.steps) ? data.steps : []
        });
      })
        .catch(err => {
          console.error('Extraction failed:', err);
          alert('Extraction failed. Please check the URL or try again later.');
        });
    }

  /**
   * Generate simple tag suggestions from recipe content.
   */
  function suggestTags(data) {
    const field = document.getElementById('recipe-tags');
    if (!field) return;
    const text = `${data.title} ${data.ingredients.join(' ')} ${data.steps.join(' ')}`.toLowerCase();
    const suggestions = [];
    const cuisines = ['italian', 'mexican', 'chinese', 'indian', 'thai', 'french', 'japanese', 'spanish', 'greek', 'mediterranean', 'american'];
    const proteins = ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'salmon', 'shrimp', 'tofu', 'egg'];
    const types = ['dessert', 'soup', 'salad', 'bread', 'cake', 'cookie', 'pasta', 'sandwich', 'stew', 'curry'];
    const addSuggestions = list => {
      list.forEach(item => {
        if (text.includes(item) && suggestions.length < 3 && !suggestions.includes(item)) {
          suggestions.push(item);
        }
      });
    };
    addSuggestions(cuisines);
    addSuggestions(proteins);
    addSuggestions(types);
    if (!suggestions.length) return;
    if (field.value.trim()) {
      const existing = field.value.split(',').map(t => t.trim()).filter(Boolean);
      suggestions.forEach(tag => {
        if (!existing.map(e => e.toLowerCase()).includes(tag)) {
          existing.push(tag);
        }
      });
      field.value = existing.slice(0, 3).join(', ');
    } else {
      field.value = suggestions.slice(0, 3).join(', ');
    }
  }

  /**
   * Save the recipe to localStorage for the current user.
   */
  function saveRecipe() {
    const currentUser = localStorage.getItem('currentUser');
    const title = document.getElementById('recipe-title').value.trim();
    const source = document.getElementById('recipe-source').value.trim();
    const date = document.getElementById('recipe-date').value.trim();
    const ingredients = document.getElementById('recipe-ingredients').value.trim().split(/\n+/).filter(Boolean);
    const steps = document.getElementById('recipe-steps').value.trim().split(/\n+/).filter(Boolean);
    const tags = document.getElementById('recipe-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    // Handle image upload
    const imageInput = document.getElementById('recipe-image');
    const file = imageInput.files[0];
    const extractedImage = document.getElementById('extracted-image').value.trim();
    // Build recipe object and then store after reading image if needed
    const finalizeSave = (imageData) => {
      const recipe = {
        id: Date.now(),
        createdAt: Date.now(),
        url: document.getElementById('recipe-url').value.trim(),
        title,
        source,
        date,
        ingredients,
        steps,
        tags,
        image: imageData || extractedImage || null
      };
      const key = `recipes_${currentUser}`;
      const recipes = JSON.parse(localStorage.getItem(key) || '[]');
      // Check if editing
      const editId = localStorage.getItem('editRecipeId');
      if (editId) {
        // Update existing recipe
        const idx = recipes.findIndex(r => r.id == editId);
        if (idx >= 0) {
          // Preserve original id
          recipe.id = parseInt(editId);
          recipe.createdAt = recipes[idx].createdAt || recipes[idx].id || Date.now();
          recipes[idx] = recipe;
        } else {
          // If not found, append
          recipes.push(recipe);
        }
        localStorage.removeItem('editRecipeId');
        localStorage.setItem(key, JSON.stringify(recipes));
        alert('Recipe updated successfully!');
        // Redirect to view page after editing
        window.location.href = 'view.html';
        return;
      }
      // Not editing: add new recipe
      recipes.push(recipe);
      localStorage.setItem(key, JSON.stringify(recipes));
      alert('Recipe saved successfully!');
      // Reset form
      document.getElementById('add-recipe-form').reset();
      document.getElementById('recipe-source').value = '';
      document.getElementById('extracted-image').value = '';
      document.getElementById('recipe-date').value = new Date().toLocaleDateString();
    };
    if (file) {
      const reader = new FileReader();
      reader.onload = function () {
        finalizeSave(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      finalizeSave(null);
    }
  }

  /**
   * Initialiser for the view recipes page.
   */
  function initView() {
    // Enforce authentication
    if (!localStorage.getItem('currentUser')) {
      localStorage.setItem('redirectAfterLogin', 'view.html');
      window.location.href = 'login.html';
      return;
    }
    const currentUser = localStorage.getItem('currentUser');
    const savedMode = sessionStorage.getItem(`${VIEW_MODE_KEY_PREFIX}${currentUser}`);
    viewState.mode = savedMode === 'table' ? 'table' : 'card';
    viewState.currentPage = 1;

    const filterIdInput = document.getElementById('filter-id');
    const filterDateInput = document.getElementById('filter-date-added');
    const filterNameInput = document.getElementById('filter-name');
    const filterSourceInput = document.getElementById('filter-source');
    const filterTagsInput = document.getElementById('filter-tags');
    const clearBtn = document.getElementById('clear-filter');
    const cardViewBtn = document.getElementById('card-view-btn');
    const tableViewBtn = document.getElementById('table-view-btn');

    [filterIdInput, filterDateInput, filterNameInput, filterSourceInput, filterTagsInput].forEach(input => {
      input.addEventListener('input', function () {
        viewState.filters.id = filterIdInput.value.trim().toLowerCase();
        viewState.filters.dateAdded = filterDateInput.value.trim().toLowerCase();
        viewState.filters.name = filterNameInput.value.trim().toLowerCase();
        viewState.filters.source = filterSourceInput.value.trim().toLowerCase();
        viewState.filters.tags = filterTagsInput.value.trim().toLowerCase();
        viewState.currentPage = 1;
        renderRecipes();
      });
    });

    clearBtn.addEventListener('click', function () {
      filterIdInput.value = '';
      filterDateInput.value = '';
      filterNameInput.value = '';
      filterSourceInput.value = '';
      filterTagsInput.value = '';
      viewState.filters.id = '';
      viewState.filters.dateAdded = '';
      viewState.filters.name = '';
      viewState.filters.source = '';
      viewState.filters.tags = '';
      viewState.currentPage = 1;
      renderRecipes();
    });

    cardViewBtn.addEventListener('click', function () {
      setViewMode('card');
    });
    tableViewBtn.addEventListener('click', function () {
      setViewMode('table');
    });

    renderRecipes();
  }

  function setViewMode(mode) {
    const currentUser = localStorage.getItem('currentUser');
    viewState.mode = mode;
    viewState.currentPage = 1;
    if (currentUser) {
      sessionStorage.setItem(`${VIEW_MODE_KEY_PREFIX}${currentUser}`, mode);
    }
    renderRecipes();
  }

  /**
   * Get the source domain from a URL string.
   */
  function getSourceFromUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace('www.', '');
    } catch (e) {
      return '';
    }
  }

  /**
   * Retrieve recipes for the current user.
   */
  function getRecipes() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return [];
    const key = `recipes_${currentUser}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  }

  function getDateAddedTimestamp(recipe) {
    if (typeof recipe.createdAt === 'number' && Number.isFinite(recipe.createdAt)) {
      return recipe.createdAt;
    }
    if (typeof recipe.id === 'number' && Number.isFinite(recipe.id)) {
      return recipe.id;
    }
    const parsed = Date.parse(recipe.date || '');
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function getRecipeRows() {
    const rows = getRecipes().map(recipe => {
      const dateAddedTs = getDateAddedTimestamp(recipe);
      const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
      return {
        recipe,
        storageId: recipe.id,
        dateAddedTs,
        dateAddedText: dateAddedTs ? new Date(dateAddedTs).toLocaleDateString() : '',
        nameText: recipe.title || '',
        sourceText: recipe.source || '',
        tagsText: tags.join(', ')
      };
    });

    const byDateAdded = rows.slice().sort((a, b) => {
      if (a.dateAddedTs !== b.dateAddedTs) return a.dateAddedTs - b.dateAddedTs;
      return String(a.storageId).localeCompare(String(b.storageId));
    });

    byDateAdded.forEach((row, index) => {
      row.displayId = index + 1;
    });

    return rows;
  }

  function applyFilters(rows) {
    return rows.filter(row => {
      if (viewState.filters.id && !String(row.displayId).toLowerCase().includes(viewState.filters.id)) {
        return false;
      }
      if (viewState.filters.dateAdded && !row.dateAddedText.toLowerCase().includes(viewState.filters.dateAdded)) {
        return false;
      }
      if (viewState.filters.name && !row.nameText.toLowerCase().includes(viewState.filters.name)) {
        return false;
      }
      if (viewState.filters.source && !row.sourceText.toLowerCase().includes(viewState.filters.source)) {
        return false;
      }
      if (viewState.filters.tags && !row.tagsText.toLowerCase().includes(viewState.filters.tags)) {
        return false;
      }
      return true;
    });
  }

  function applySort(rows) {
    const sorted = rows.slice();
    sorted.sort((a, b) => {
      let compare = 0;
      switch (viewState.sortColumn) {
        case 'id':
          compare = a.displayId - b.displayId;
          break;
        case 'name':
          compare = a.nameText.localeCompare(b.nameText);
          break;
        case 'source':
          compare = a.sourceText.localeCompare(b.sourceText);
          break;
        case 'tags':
          compare = a.tagsText.localeCompare(b.tagsText);
          break;
        case 'dateAdded':
        default:
          compare = a.dateAddedTs - b.dateAddedTs;
          break;
      }
      if (compare === 0) {
        compare = a.displayId - b.displayId;
      }
      return viewState.sortDirection === 'asc' ? compare : -compare;
    });
    return sorted;
  }

  function setSort(column) {
    if (viewState.sortColumn === column) {
      viewState.sortDirection = viewState.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      viewState.sortColumn = column;
      viewState.sortDirection = 'asc';
    }
    viewState.currentPage = 1;
    renderRecipes();
  }

  function updateViewToggleUi() {
    const container = document.getElementById('recipes-container');
    const cardViewBtn = document.getElementById('card-view-btn');
    const tableViewBtn = document.getElementById('table-view-btn');
    if (!container || !cardViewBtn || !tableViewBtn) return;
    container.classList.toggle('card-mode', viewState.mode === 'card');
    container.classList.toggle('table-mode', viewState.mode === 'table');
    cardViewBtn.classList.toggle('active', viewState.mode === 'card');
    tableViewBtn.classList.toggle('active', viewState.mode === 'table');
    cardViewBtn.setAttribute('aria-pressed', viewState.mode === 'card' ? 'true' : 'false');
    tableViewBtn.setAttribute('aria-pressed', viewState.mode === 'table' ? 'true' : 'false');
  }

  function renderPagination(totalItems, totalPages) {
    const controls = document.getElementById('pagination-controls');
    if (!controls) return;
    controls.innerHTML = '';
    if (!totalItems) return;

    const startItem = (viewState.currentPage - 1) * PAGE_SIZE + 1;
    const endItem = Math.min(viewState.currentPage * PAGE_SIZE, totalItems);

    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `Showing ${startItem}-${endItem} of ${totalItems}`;

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.textContent = 'Previous';
    prevBtn.disabled = viewState.currentPage <= 1;
    prevBtn.addEventListener('click', function () {
      if (viewState.currentPage > 1) {
        viewState.currentPage -= 1;
        renderRecipes();
      }
    });

    const pageLabel = document.createElement('span');
    pageLabel.className = 'pagination-page';
    pageLabel.textContent = `Page ${viewState.currentPage} of ${totalPages}`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = 'Next';
    nextBtn.disabled = viewState.currentPage >= totalPages;
    nextBtn.addEventListener('click', function () {
      if (viewState.currentPage < totalPages) {
        viewState.currentPage += 1;
        renderRecipes();
      }
    });

    controls.appendChild(info);
    controls.appendChild(prevBtn);
    controls.appendChild(pageLabel);
    controls.appendChild(nextBtn);
  }

  function renderEmpty(container) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No recipes match your filters.';
    container.appendChild(empty);
  }

  function renderCardRecipes(container, rows) {
    rows.forEach(row => {
      const recipe = row.recipe;
      const card = document.createElement('div');
      card.className = 'recipe-card';

      const title = document.createElement('h3');
      title.textContent = recipe.title || 'Untitled Recipe';
      card.appendChild(title);

      const meta = document.createElement('p');
      meta.textContent = `${row.sourceText || 'Unknown source'} • Added ${row.dateAddedText || 'Unknown date'} • ID ${row.displayId}`;
      card.appendChild(meta);

      if (recipe.tags && recipe.tags.length) {
        const tagContainer = document.createElement('div');
        tagContainer.className = 'tags';
        recipe.tags.forEach(tag => {
          const span = document.createElement('span');
          span.className = 'tag';
          span.textContent = tag;
          tagContainer.appendChild(span);
        });
        card.appendChild(tagContainer);
      }

      const actionContainer = document.createElement('div');
      actionContainer.className = 'recipe-actions';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'view-btn';
      viewBtn.textContent = 'View';
      actionContainer.appendChild(viewBtn);

      const editBtn = document.createElement('button');
      editBtn.className = 'edit-btn';
      editBtn.textContent = 'Edit';
      actionContainer.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Delete';
      actionContainer.appendChild(deleteBtn);

      card.appendChild(actionContainer);

      const details = document.createElement('div');
      details.className = 'details';

      if (recipe.image) {
        const img = document.createElement('img');
        img.src = recipe.image;
        details.appendChild(img);
      }

      if (recipe.ingredients && recipe.ingredients.length) {
        const ingHeader = document.createElement('p');
        ingHeader.innerHTML = '<strong>Ingredients:</strong>';
        details.appendChild(ingHeader);
        const ul = document.createElement('ul');
        recipe.ingredients.forEach(i => {
          const li = document.createElement('li');
          li.textContent = i;
          ul.appendChild(li);
        });
        details.appendChild(ul);
      }

      if (recipe.steps && recipe.steps.length) {
        const stepsHeader = document.createElement('p');
        stepsHeader.innerHTML = '<strong>Steps:</strong>';
        details.appendChild(stepsHeader);
        const ol = document.createElement('ol');
        recipe.steps.forEach(s => {
          const li = document.createElement('li');
          li.textContent = s;
          ol.appendChild(li);
        });
        details.appendChild(ol);
      }

      if (recipe.url) {
        const linkPara = document.createElement('p');
        const link = document.createElement('a');
        link.href = recipe.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'View original';
        linkPara.appendChild(link);
        details.appendChild(linkPara);
      }
      card.appendChild(details);

      viewBtn.addEventListener('click', function () {
        const isVisible = details.style.display === 'block';
        details.style.display = isVisible ? 'none' : 'block';
        viewBtn.textContent = isVisible ? 'View' : 'Hide';
      });

      editBtn.addEventListener('click', function () {
        localStorage.setItem('editRecipeId', recipe.id);
        window.location.href = 'add.html';
      });

      deleteBtn.addEventListener('click', function () {
        if (confirm('Are you sure you want to delete this recipe?')) {
          const currentUser = localStorage.getItem('currentUser');
          const key = `recipes_${currentUser}`;
          const allRecipes = JSON.parse(localStorage.getItem(key) || '[]');
          const updated = allRecipes.filter(r => r.id !== recipe.id);
          localStorage.setItem(key, JSON.stringify(updated));
          renderRecipes();
        }
      });

      container.appendChild(card);
    });
  }

  function getSortIndicator(column) {
    if (viewState.sortColumn !== column) return '';
    return viewState.sortDirection === 'asc' ? ' ▲' : ' ▼';
  }

  function renderTableRecipes(container, rows) {
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'recipes-table-wrapper';

    const table = document.createElement('table');
    table.className = 'recipes-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = [
      { key: 'id', label: 'Recipe ID' },
      { key: 'dateAdded', label: 'Date Added' },
      { key: 'name', label: 'Recipe Name' },
      { key: 'source', label: 'Source' },
      { key: 'tags', label: 'Tags' }
    ];

    headers.forEach(header => {
      const th = document.createElement('th');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-sort-btn';
      button.textContent = `${header.label}${getSortIndicator(header.key)}`;
      button.addEventListener('click', function () {
        setSort(header.key);
      });
      th.appendChild(button);
      headerRow.appendChild(th);
    });

    const actionsTh = document.createElement('th');
    actionsTh.textContent = 'Actions';
    headerRow.appendChild(actionsTh);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const recipe = row.recipe;
      const tr = document.createElement('tr');

      const idTd = document.createElement('td');
      idTd.textContent = String(row.displayId);
      tr.appendChild(idTd);

      const dateTd = document.createElement('td');
      dateTd.textContent = row.dateAddedText || 'Unknown';
      tr.appendChild(dateTd);

      const nameTd = document.createElement('td');
      nameTd.textContent = row.nameText || 'Untitled Recipe';
      tr.appendChild(nameTd);

      const sourceTd = document.createElement('td');
      sourceTd.textContent = row.sourceText || 'Unknown';
      tr.appendChild(sourceTd);

      const tagsTd = document.createElement('td');
      tagsTd.textContent = row.tagsText || 'None';
      tr.appendChild(tagsTd);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'table-actions';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'view-btn';
      viewBtn.textContent = 'View';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'edit-btn';
      editBtn.textContent = 'Edit';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Delete';

      actionsTd.appendChild(viewBtn);
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);
      tr.appendChild(actionsTd);

      const detailsTr = document.createElement('tr');
      detailsTr.className = 'table-details-row';
      detailsTr.style.display = 'none';

      const detailsTd = document.createElement('td');
      detailsTd.colSpan = 6;

      const details = document.createElement('div');
      details.className = 'details table-details';

      if (recipe.image) {
        const img = document.createElement('img');
        img.src = recipe.image;
        details.appendChild(img);
      }

      if (recipe.ingredients && recipe.ingredients.length) {
        const ingHeader = document.createElement('p');
        ingHeader.innerHTML = '<strong>Ingredients:</strong>';
        details.appendChild(ingHeader);
        const ul = document.createElement('ul');
        recipe.ingredients.forEach(i => {
          const li = document.createElement('li');
          li.textContent = i;
          ul.appendChild(li);
        });
        details.appendChild(ul);
      }

      if (recipe.steps && recipe.steps.length) {
        const stepsHeader = document.createElement('p');
        stepsHeader.innerHTML = '<strong>Steps:</strong>';
        details.appendChild(stepsHeader);
        const ol = document.createElement('ol');
        recipe.steps.forEach(s => {
          const li = document.createElement('li');
          li.textContent = s;
          ol.appendChild(li);
        });
        details.appendChild(ol);
      }

      if (recipe.url) {
        const linkPara = document.createElement('p');
        const link = document.createElement('a');
        link.href = recipe.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'View original';
        linkPara.appendChild(link);
        details.appendChild(linkPara);
      }

      detailsTd.appendChild(details);
      detailsTr.appendChild(detailsTd);

      viewBtn.addEventListener('click', function () {
        const isVisible = detailsTr.style.display === 'table-row';
        detailsTr.style.display = isVisible ? 'none' : 'table-row';
        details.style.display = isVisible ? 'none' : 'block';
        viewBtn.textContent = isVisible ? 'View' : 'Hide';
      });

      editBtn.addEventListener('click', function () {
        localStorage.setItem('editRecipeId', recipe.id);
        window.location.href = 'add.html';
      });

      deleteBtn.addEventListener('click', function () {
        if (confirm('Are you sure you want to delete this recipe?')) {
          const currentUser = localStorage.getItem('currentUser');
          const key = `recipes_${currentUser}`;
          const allRecipes = JSON.parse(localStorage.getItem(key) || '[]');
          const updated = allRecipes.filter(r => r.id !== recipe.id);
          localStorage.setItem(key, JSON.stringify(updated));
          renderRecipes();
        }
      });

      tbody.appendChild(tr);
      tbody.appendChild(detailsTr);
    });

    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);
  }

  /**
   * Render the list of recipes in the view page according to the filter.
   */
  function renderRecipes() {
    const container = document.getElementById('recipes-container');
    if (!container) return;
    container.innerHTML = '';
    updateViewToggleUi();

    const filtered = applyFilters(getRecipeRows());
    const sorted = applySort(filtered);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    viewState.currentPage = Math.min(viewState.currentPage, totalPages);
    const start = (viewState.currentPage - 1) * PAGE_SIZE;
    const pageRows = sorted.slice(start, start + PAGE_SIZE);

    if (!sorted.length) {
      renderEmpty(container);
    } else if (viewState.mode === 'table') {
      renderTableRecipes(container, pageRows);
    } else {
      renderCardRecipes(container, pageRows);
    }

    renderPagination(sorted.length, totalPages);
  }
})();
