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
      // Not logged in: show sign-in link
      const signInLink = document.createElement('a');
      signInLink.href = 'login.html';
      signInLink.textContent = 'Sign in';
      userMenu.appendChild(signInLink);
    }
  }

  /**
   * Initialiser for the home page. Makes hero sections clickable.
   */
  function initHome() {
    const addSection = document.getElementById('hero-add');
    const viewSection = document.getElementById('hero-view');
    addSection.addEventListener('click', function () {
      if (!localStorage.getItem('currentUser')) {
        localStorage.setItem('redirectAfterLogin', 'add.html');
        window.location.href = 'login.html';
      } else {
        window.location.href = 'add.html';
      }
    });
    viewSection.addEventListener('click', function () {
      if (!localStorage.getItem('currentUser')) {
        localStorage.setItem('redirectAfterLogin', 'view.html');
        window.location.href = 'login.html';
      } else {
        window.location.href = 'view.html';
      }
    });
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
    // Populate date field
    const dateInput = document.getElementById('recipe-date');
    const now = new Date();
    dateInput.value = now.toLocaleDateString();
    // Extract button handler
    const extractBtn = document.getElementById('extract-btn');
    extractBtn.addEventListener('click', handleExtraction);
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
    // Determine backend URL. Replace localhost with your deployed backend when needed.
    const backendUrl = 'https://cocinando-1.onrender.com/extract';
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
      })
      .catch(() => {
        alert('Extraction failed. Please check the URL or try again later.');
      });
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
        image: imageData || null
      };
      const key = `recipes_${currentUser}`;
      const recipes = JSON.parse(localStorage.getItem(key) || '[]');
      recipes.push(recipe);
      localStorage.setItem(key, JSON.stringify(recipes));
      alert('Recipe saved successfully!');
      // Reset form
      document.getElementById('add-recipe-form').reset();
      document.getElementById('recipe-source').value = '';
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
      // View details button
      const viewBtn = document.createElement('button');
      viewBtn.className = 'view-btn';
      viewBtn.textContent = 'View Details';
      card.appendChild(viewBtn);
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
        viewBtn.textContent = isVisible ? 'View Details' : 'Hide Details';
      });
      container.appendChild(card);
    });
  }
})();
