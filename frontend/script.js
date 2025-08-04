/*
 * script.js – core logic for the recipe organizer website
 *
 * This script handles user authentication using localStorage, as well as
 * creation and display of recipe entries. Recipes are stored per-user in
 * localStorage under the key `recipes_<username>` and the currently
 * authenticated user is stored under the key `currentUser`.
 */

(function () {
  /**
   * Retrieve the current page identifier from the body dataset. This value
   * determines which initialization function to run.
   */
  const page = document.body.dataset.page;

  switch (page) {
    case 'login':
      initLogin();
      break;
    case 'signup':
      initSignup();
      break;
    case 'home':
      initHome();
      break;
    case 'add':
      initAdd();
      break;
    case 'view':
      initView();
      break;
    // Legacy support for dashboard page
    case 'dashboard':
      initDashboard();
      break;
  }

  /**
   * Initialize the login page. Attach event listeners to handle form
   * submission and perform authentication against stored user data.
   */
  function initLogin() {
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (!username || !password) return;
      const users = loadUsers();
      if (!users[username] || users[username].password !== password) {
        alert('Invalid username or password.');
        return;
      }
      // Store the current user and redirect
      localStorage.setItem('currentUser', username);
      window.location.href = 'home.html';
    });
  }

  /**
   * Initialize the signup page. Validate the signup form and store new
   * user credentials in localStorage. On success, redirect to login.
   */
  function initSignup() {
    const form = document.getElementById('signupForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const username = document.getElementById('signup-username').value.trim();
      const password = document.getElementById('signup-password').value;
      const confirm = document.getElementById('signup-confirm').value;
      if (!username || !password) {
        alert('Please fill out all fields.');
        return;
      }
      if (password !== confirm) {
        alert('Passwords do not match.');
        return;
      }
      const users = loadUsers();
      if (users[username]) {
        alert('Username already exists. Please choose another.');
        return;
      }
      // Store the new user
      users[username] = { password: password };
      saveUsers(users);
      alert('Account created successfully! You can now log in.');
      window.location.href = 'index.html';
    });
  }

  /**
   * Initialize the dashboard page. Set up event listeners for adding
   * recipes, filtering the list, and logging out. Load the current
   * user's recipes from localStorage and render them.
   */
  function initDashboard() {
    // Verify a user is logged in
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      // No user; redirect to login
      window.location.href = 'index.html';
      return;
    }
    // Display username
    const userDisplay = document.getElementById('userDisplayName');
    if (userDisplay) userDisplay.textContent = currentUser;
    // Logout button
    const logoutButton = document.getElementById('logoutButton');
    logoutButton.addEventListener('click', function () {
      localStorage.removeItem('currentUser');
      window.location.href = 'index.html';
    });
    // Load and render recipes
    renderRecipes(loadRecipes(currentUser));
    // Handle recipe submission
    const recipeForm = document.getElementById('recipeForm');
    recipeForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const url = document.getElementById('recipe-url').value.trim();
      const title = document.getElementById('recipe-title').value.trim();
      const ingredientsText = document.getElementById('recipe-ingredients').value.trim();
      const stepsText = document.getElementById('recipe-steps').value.trim();
      const tagsText = document.getElementById('recipe-tags').value.trim();
      const imageInput = document.getElementById('recipe-image');
      if (!url || !title || !ingredientsText || !stepsText) {
        alert('Please fill out all required fields.');
        return;
      }
      // Derive the source hostname
      let source;
      try {
        const parsed = new URL(url);
        source = parsed.hostname.replace(/^www\./, '');
      } catch (err) {
        alert('Invalid URL provided.');
        return;
      }
      const ingredients = ingredientsText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const tags = tagsText
        ? tagsText
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : [];
      // Helper to persist the recipe once we have the image (or not)
      function persistRecipe(imageData) {
        const newRecipe = {
          id: Date.now(),
          url,
          title,
          source,
          ingredients,
          steps: stepsText,
          tags,
          image: imageData || null,
          createdAt: new Date().toISOString(),
        };
        const recipes = loadRecipes(currentUser);
        recipes.unshift(newRecipe);
        saveRecipes(currentUser, recipes);
        renderRecipes(recipes);
        // Reset form fields (including file input)
        recipeForm.reset();
      }
      const file = imageInput && imageInput.files ? imageInput.files[0] : null;
      if (file) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          persistRecipe(ev.target.result);
        };
        reader.onerror = function () {
          // If reading fails, still save without image
          persistRecipe(null);
        };
        reader.readAsDataURL(file);
      } else {
        persistRecipe(null);
      }
    });
    // Filtering functionality
    const filterInput = document.getElementById('filterInput');
    filterInput.addEventListener('input', function (e) {
      const query = e.target.value.toLowerCase();
      const recipes = loadRecipes(currentUser);
      const filtered = recipes.filter((recipe) => {
        return (
          recipe.title.toLowerCase().includes(query) ||
          recipe.tags.some((t) => t.includes(query))
        );
      });
      renderRecipes(filtered);
    });
    const clearFilterButton = document.getElementById('clearFilter');
    clearFilterButton.addEventListener('click', function () {
      filterInput.value = '';
      renderRecipes(loadRecipes(currentUser));
    });

    // Extraction functionality
    const extractButton = document.getElementById('extractButton');
    if (extractButton) {
      extractButton.addEventListener('click', function () {
        const urlInput = document.getElementById('recipe-url');
        const targetUrl = urlInput.value.trim();
        if (!targetUrl) {
          alert('Please enter a URL to extract from.');
          return;
        }
        extractButton.disabled = true;
        extractButton.textContent = 'Extracting…';
        fetch('http://localhost:8000/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error('Server error');
            }
            return response.json();
          })
          .then((data) => {
            // Fill the form fields if values are returned
            if (data.title) {
              document.getElementById('recipe-title').value = data.title;
            }
            if (data.ingredients && Array.isArray(data.ingredients) && data.ingredients.length) {
              document.getElementById('recipe-ingredients').value = data.ingredients.join('\n');
            }
            if (data.steps && Array.isArray(data.steps) && data.steps.length) {
              document.getElementById('recipe-steps').value = data.steps.join('\n');
            }
            // Optionally, auto‑generate simple tags from the title
            // For now we leave tags blank for manual entry
          })
          .catch((err) => {
            console.error(err);
            alert('Extraction failed: ' + err.message);
          })
          .finally(() => {
            extractButton.disabled = false;
            extractButton.textContent = 'Extract';
          });
      });
    }
  }

  /**
   * Render the given recipes array into the DOM. It removes existing
   * elements and creates new DOM nodes for each recipe.
   *
   * @param {Array} recipes – An array of recipe objects.
   */
  function renderRecipes(recipes) {
    const list = document.getElementById('recipesList');
    if (!list) return;
    list.innerHTML = '';
    if (!recipes || recipes.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No recipes found. Start by adding one!';
      li.style.fontStyle = 'italic';
      list.appendChild(li);
      return;
    }
    recipes.forEach((recipe) => {
      const li = document.createElement('li');
      li.classList.add('recipe-item');
      // Title
      const title = document.createElement('h3');
      title.textContent = recipe.title;
      // Meta information: source and date
      const meta = document.createElement('div');
      meta.classList.add('recipe-meta');
      const date = new Date(recipe.createdAt);
      meta.textContent = `${recipe.source} • ${date.toLocaleDateString()}`;
      // Tags
      const tagsDiv = document.createElement('div');
      tagsDiv.classList.add('recipe-tags');
      recipe.tags.forEach((t) => {
        const tagSpan = document.createElement('span');
        tagSpan.classList.add('tag');
        tagSpan.textContent = t;
        tagsDiv.appendChild(tagSpan);
      });
      // Details toggle button
      const detailsButton = document.createElement('button');
      detailsButton.type = 'button';
      detailsButton.classList.add('details-button');
      detailsButton.textContent = 'View Details';
      // Details container
      const detailsDiv = document.createElement('div');
      detailsDiv.classList.add('recipe-details');
      detailsDiv.style.display = 'none';
      // Build details content
      // Image
      if (recipe.image) {
        const img = document.createElement('img');
        img.src = recipe.image;
        img.alt = recipe.title + ' image';
        detailsDiv.appendChild(img);
      }
      // Ingredients
      const ingHeading = document.createElement('h4');
      ingHeading.textContent = 'Ingredients';
      detailsDiv.appendChild(ingHeading);
      const ingList = document.createElement('ul');
      recipe.ingredients.forEach((ing) => {
        const liIng = document.createElement('li');
        liIng.textContent = ing;
        ingList.appendChild(liIng);
      });
      detailsDiv.appendChild(ingList);
      // Steps
      const stepsHeading = document.createElement('h4');
      stepsHeading.textContent = 'Steps';
      detailsDiv.appendChild(stepsHeading);
      const stepsList = document.createElement('ol');
      // Steps may be stored as a single string; split on newlines
      const stepsArray = Array.isArray(recipe.steps)
        ? recipe.steps
        : recipe.steps.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      stepsArray.forEach((step) => {
        const liStep = document.createElement('li');
        liStep.textContent = step;
        stepsList.appendChild(liStep);
      });
      detailsDiv.appendChild(stepsList);
      // Link
      const linkHeading = document.createElement('h4');
      linkHeading.textContent = 'Source';
      detailsDiv.appendChild(linkHeading);
      const linkAnchor = document.createElement('a');
      linkAnchor.href = recipe.url;
      linkAnchor.textContent = recipe.url;
      linkAnchor.target = '_blank';
      linkAnchor.rel = 'noopener noreferrer';
      detailsDiv.appendChild(linkAnchor);
      // Append children to recipe item
      li.appendChild(title);
      li.appendChild(meta);
      if (recipe.tags.length) li.appendChild(tagsDiv);
      li.appendChild(detailsButton);
      li.appendChild(detailsDiv);
      // Toggle logic
      detailsButton.addEventListener('click', function () {
        const isHidden = detailsDiv.style.display === 'none';
        detailsDiv.style.display = isHidden ? 'block' : 'none';
        detailsButton.textContent = isHidden ? 'Hide Details' : 'View Details';
      });
      list.appendChild(li);
    });
  }

  /**
   * Retrieve all registered users from localStorage. The users are stored
   * as a mapping of usernames to user objects.
   *
   * @returns {Object}
   */
  function loadUsers() {
    const raw = localStorage.getItem('users');
    return raw ? JSON.parse(raw) : {};
  }

  /**
   * Persist the users mapping to localStorage.
   *
   * @param {Object} users
   */
  function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
  }

  /**
   * Load recipes for a specific user from localStorage. Returns an empty
   * array if none exist.
   *
   * @param {string} username
   * @returns {Array}
   */
  function loadRecipes(username) {
    const raw = localStorage.getItem('recipes_' + username);
    return raw ? JSON.parse(raw) : [];
  }

  /**
   * Save the recipes array for a user back into localStorage.
   *
   * @param {string} username
   * @param {Array} recipes
   */
  function saveRecipes(username, recipes) {
    localStorage.setItem('recipes_' + username, JSON.stringify(recipes));
  }

  /**
   * Initialize the home page. Verifies authentication and populates the
   * username. Provides logout functionality.
   */
  function initHome() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      window.location.href = 'index.html';
      return;
    }
    const userDisplay = document.getElementById('userDisplayName');
    if (userDisplay) userDisplay.textContent = currentUser;
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', function () {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
      });
    }
  }

  /**
   * Initialize the add recipe page. Handles adding new recipes and
   * extraction while verifying authentication. Does not render a recipe
   * list.
   */
  function initAdd() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      window.location.href = 'index.html';
      return;
    }
    const userDisplay = document.getElementById('userDisplayName');
    if (userDisplay) userDisplay.textContent = currentUser;
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', function () {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
      });
    }
    // Handle recipe submission
    const recipeForm = document.getElementById('recipeForm');
    if (recipeForm) {
      recipeForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const url = document.getElementById('recipe-url').value.trim();
        const title = document.getElementById('recipe-title').value.trim();
        const ingredientsText = document.getElementById('recipe-ingredients').value.trim();
        const stepsText = document.getElementById('recipe-steps').value.trim();
        const tagsText = document.getElementById('recipe-tags').value.trim();
        const imageInput = document.getElementById('recipe-image');
        if (!url || !title || !ingredientsText || !stepsText) {
          alert('Please fill out all required fields.');
          return;
        }
        let source;
        try {
          const parsed = new URL(url);
          source = parsed.hostname.replace(/^www\./, '');
        } catch (err) {
          alert('Invalid URL provided.');
          return;
        }
        const ingredients = ingredientsText
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean);
        const tags = tagsText
          ? tagsText
              .split(',')
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean)
          : [];
        function persist(imageData) {
          const newRecipe = {
            id: Date.now(),
            url,
            title,
            source,
            ingredients,
            steps: stepsText,
            tags,
            image: imageData || null,
            createdAt: new Date().toISOString(),
          };
          const recipes = loadRecipes(currentUser);
          recipes.unshift(newRecipe);
          saveRecipes(currentUser, recipes);
          // Reset form after save
          recipeForm.reset();
          alert('Recipe added successfully.');
        }
        const file = imageInput && imageInput.files ? imageInput.files[0] : null;
        if (file) {
          const reader = new FileReader();
          reader.onload = function (ev) {
            persist(ev.target.result);
          };
          reader.onerror = function () {
            persist(null);
          };
          reader.readAsDataURL(file);
        } else {
          persist(null);
        }
      });
    }
    // Extraction functionality
    const extractButton = document.getElementById('extractButton');
    if (extractButton) {
      extractButton.addEventListener('click', function () {
        const urlInput = document.getElementById('recipe-url');
        const targetUrl = urlInput.value.trim();
        if (!targetUrl) {
          alert('Please enter a URL to extract from.');
          return;
        }
        extractButton.disabled = true;
        extractButton.textContent = 'Extracting…';
        fetch('http://localhost:8000/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        })
          .then((response) => {
            if (!response.ok) throw new Error('Server error');
            return response.json();
          })
          .then((data) => {
            if (data.title) {
              document.getElementById('recipe-title').value = data.title;
            }
            if (data.ingredients && Array.isArray(data.ingredients) && data.ingredients.length) {
              document.getElementById('recipe-ingredients').value = data.ingredients.join('\n');
            }
            if (data.steps && Array.isArray(data.steps) && data.steps.length) {
              document.getElementById('recipe-steps').value = data.steps.join('\n');
            }
          })
          .catch((err) => {
            console.error(err);
            alert('Extraction failed: ' + err.message);
          })
          .finally(() => {
            extractButton.disabled = false;
            extractButton.textContent = 'Extract';
          });
      });
    }
  }

  /**
   * Initialize the view recipes page. Renders the list and enables
   * filtering. Requires the user to be logged in.
   */
  function initView() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      window.location.href = 'index.html';
      return;
    }
    const userDisplay = document.getElementById('userDisplayName');
    if (userDisplay) userDisplay.textContent = currentUser;
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', function () {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
      });
    }
    // Render the user's recipes
    renderRecipes(loadRecipes(currentUser));
    // Filtering functionality
    const filterInput = document.getElementById('filterInput');
    if (filterInput) {
      filterInput.addEventListener('input', function (e) {
        const query = e.target.value.toLowerCase();
        const recipes = loadRecipes(currentUser);
        const filtered = recipes.filter((recipe) => {
          return (
            recipe.title.toLowerCase().includes(query) ||
            recipe.tags.some((t) => t.includes(query))
          );
        });
        renderRecipes(filtered);
      });
    }
    const clearFilterButton = document.getElementById('clearFilter');
    if (clearFilterButton) {
      clearFilterButton.addEventListener('click', function () {
        if (filterInput) filterInput.value = '';
        renderRecipes(loadRecipes(currentUser));
      });
    }
  }
})();