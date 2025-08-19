/*
 * script.js – client-side logic for Cocinando.Life
 *
 * This script handles navigation rendering, authentication, recipe storage,
 * extraction via the backend server, and dynamic page initialization.
 */

(function () {
  /**
   * Initialise the correct page based on the data-page attribute on the body.
   */
  document.addEventListener('DOMContentLoaded', function () {
    renderNav();
    // Clear any pending edit when navigating to the add recipe page
    document.querySelectorAll('a[href="add.html"]').forEach(link => {
      link.addEventListener('click', function () {
        localStorage.removeItem('editRecipeId');
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
      // Not logged in: show sign-in and sign-up links
      const signInLink = document.createElement('a');
      signInLink.href = 'login.html';
      signInLink.textContent = 'Sign in';
      const separator = document.createTextNode(' / ');
      const signUpLink = document.createElement('a');
      signUpLink.href = 'signup.html';
      signUpLink.textContent = 'Sign up';
      userMenu.appendChild(signInLink);
      userMenu.appendChild(separator);
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
    const form = document.getElementById('add-recipe-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveRecipe();
    });
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
    // Determine backend URL.
    const host = window.location.hostname;
    const backendUrl = ['localhost', '127.0.0.1'].includes(host)
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
    const filterInput = document.getElementById('filter-input');
    const clearBtn = document.getElementById('clear-filter');
    const container = document.getElementById('recipes-container');
    filterInput.addEventListener('input', renderRecipes);
    clearBtn.addEventListener('click', function () {
      filterInput.value = '';
      renderRecipes();
    });
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

  /**
   * Render the list of recipes in the view page according to the filter.
   */
  function renderRecipes() {
    const container = document.getElementById('recipes-container');
    if (!container) return;
    container.innerHTML = '';
    const filterValue = document.getElementById('filter-input').value.toLowerCase();
    const recipes = getRecipes();
    recipes.forEach(recipe => {
      if (filterValue && !recipe.title.toLowerCase().includes(filterValue) && !recipe.tags.some(t => t.toLowerCase().includes(filterValue))) {
        return;
      }
      const card = document.createElement('div');
      card.className = 'recipe-card';
      const title = document.createElement('h3');
      title.textContent = recipe.title;
      card.appendChild(title);
      const meta = document.createElement('p');
      meta.textContent = `${recipe.source} • ${recipe.date}`;
      card.appendChild(meta);
      // Tags
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
      // Container for action buttons (view, edit, delete)
      const actionContainer = document.createElement('div');
      actionContainer.className = 'recipe-actions';
      // View details button
      const viewBtn = document.createElement('button');
      viewBtn.className = 'view-btn';
      viewBtn.textContent = 'View';
      actionContainer.appendChild(viewBtn);
      // Edit button
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-btn';
      editBtn.textContent = 'Edit';
      actionContainer.appendChild(editBtn);
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Delete';
      actionContainer.appendChild(deleteBtn);
      card.appendChild(actionContainer);
      // Details section
      const details = document.createElement('div');
      details.className = 'details';
      // Add image if exists
      if (recipe.image) {
        const img = document.createElement('img');
        img.src = recipe.image;
        details.appendChild(img);
      }
      // Ingredients
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
      // Steps
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
      // Source link
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
      // Toggle details
      viewBtn.addEventListener('click', function () {
        const isVisible = details.style.display === 'block';
        details.style.display = isVisible ? 'none' : 'block';
        viewBtn.textContent = isVisible ? 'View' : 'Hide';
      });
      // Edit handler
      editBtn.addEventListener('click', function () {
        localStorage.setItem('editRecipeId', recipe.id);
        window.location.href = 'add.html';
      });
      // Delete handler
      deleteBtn.addEventListener('click', function () {
        if (confirm('Are you sure you want to delete this recipe?')) {
          const currentUser = localStorage.getItem('currentUser');
          const key = `recipes_${currentUser}`;
          const allRecipes = JSON.parse(localStorage.getItem(key) || '[]');
          const updated = allRecipes.filter(r => r.id !== recipe.id);
          localStorage.setItem(key, JSON.stringify(updated));
          // Re-render the list
          renderRecipes();
        }
      });
      container.appendChild(card);
    });
  }
})();