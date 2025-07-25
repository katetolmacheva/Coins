document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    document.documentElement.style.setProperty('--tg-theme-bg-color', Telegram.WebApp.themeParams.bg_color || '#000000');
    document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', Telegram.WebApp.themeParams.secondary_bg_color || '#1a1a1a');
    document.documentElement.style.setProperty('--tg-theme-text-color', Telegram.WebApp.themeParams.text_color || '#FFFFFF');
    document.documentElement.style.setProperty('--tg-theme-hint-color', Telegram.WebApp.themeParams.hint_color || '#CCCCCC');
    document.documentElement.style.setProperty('--tg-theme-link-color', Telegram.WebApp.themeParams.link_color || '#FF0000');
    document.documentElement.style.setProperty('--tg-theme-button-color', Telegram.WebApp.themeParams.button_color || '#FF0000');
    document.documentElement.style.setProperty('--tg-theme-button-text-color', Telegram.WebApp.themeParams.button_text_color || '#FFFFFF');
    document.documentElement.style.setProperty('--tg-theme-header-bg-color', Telegram.WebApp.themeParams.header_bg_color || '#000000');
    document.documentElement.style.setProperty('--tg-theme-accent-text-color', Telegram.WebApp.themeParams.accent_text_color || '#FF0000');
  }

  const BASE_API_URL = (window.Telegram && window.Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param)
    ? window.location.origin
    : '';

  let cart = {};
  let coinsData = [];

  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const materialFilter = document.getElementById('material-filter');
  const denominationFilter = document.getElementById('denomination-filter');
  const availabilityFilter = document.getElementById('availability-filter');

  function loadCart() {
    const savedCart = localStorage.getItem('coinCart');
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        cart = {};
        for (const coinNumber in parsedCart) {
          const savedItem = parsedCart[coinNumber];
          const originalCoin = coinsData.find(c => c.number === coinNumber);
          if (originalCoin) {
            let quantityToLoad = savedItem.quantity;
            if (quantityToLoad > originalCoin.available_quantity) {
              quantityToLoad = originalCoin.available_quantity;
              console.warn(`Количество монеты ${coinNumber} скорректировано до доступного: ${quantityToLoad}`);
            }
            if (quantityToLoad > 0) {
              cart[coinNumber] = { ...originalCoin, quantity: quantityToLoad };
            }
          } else {
            console.warn(`Монета ${coinNumber} из localStorage не найдена в каталоге. Удаляем из корзины.`);
          }
        }
      } catch (e) {
        console.error("Ошибка при парсинге корзины из localStorage:", e);
        cart = {};
      }
    }
  }

  function saveCart() {
    const simplifiedCart = {};
    for (const coinNumber in cart) {
      simplifiedCart[coinNumber] = { quantity: cart[coinNumber].quantity };
    }
    localStorage.setItem('coinCart', JSON.stringify(simplifiedCart));
    updateCartTotalItemsDisplay();
  }

  function updateCartTotalItemsDisplay() {
    const totalItemsSpan = document.getElementById('cart-total-items');
    if (totalItemsSpan) {
      const totalItems = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
      totalItemsSpan.textContent = totalItems;
    }
  }

  function addToCart(coin) {
    const currentQuantityInCart = cart[coin.number] ? cart[coin.number].quantity : 0;
    if (currentQuantityInCart + 1 <= coin.available_quantity) {
      if (cart[coin.number]) {
        cart[coin.number].quantity++;
      } else {
        cart[coin.number] = { ...coin, quantity: 1 };
      }
      saveCart();
      if (document.getElementById('coins-container')) {
        updateCoinCardQuantity(coin.number, coin.available_quantity);
      }
    } else {
      alert('Вы достигли максимального количества этой монеты в наличии.');
    }
  }

  function updateCoinQuantityInCart(coinNumber, newQuantity) {
    const originalCoin = coinsData.find(c => c.number === coinNumber);

    if (!originalCoin) {
      console.error('Монета не найдена для обновления количества:', coinNumber);
      return;
    }

    if (newQuantity < 0) {
      newQuantity = 0;
    }

    if (newQuantity > originalCoin.available_quantity) {
      newQuantity = originalCoin.available_quantity;
      alert('Вы достигли максимального количества этой монеты в наличии.');
    }

    if (newQuantity === 0) {
      delete cart[coinNumber];
    } else {
      if (!cart[coinNumber]) {
        cart[coinNumber] = { ...originalCoin, quantity: newQuantity };
      } else {
        cart[coinNumber].quantity = newQuantity;
      }
    }
    saveCart();
    renderCartPage();
    if (document.getElementById('coins-container')) {
      updateCoinCardQuantity(coinNumber, originalCoin.available_quantity);
    }
  }

  function removeFromCart(coinNumber) {
    const originalCoin = coinsData.find(c => c.number === coinNumber);
    if (cart[coinNumber]) {
      delete cart[coinNumber];
      saveCart();
      renderCartPage();
      if (document.getElementById('coins-container') && originalCoin) {
        updateCoinCardQuantity(coinNumber, originalCoin.available_quantity);
      }
    }
  }

  function updateCoinCardQuantity(coinNumber, totalAvailable) {
    const coinsContainer = document.getElementById('coins-container');
    if (!coinsContainer) return;

    const coinCard = coinsContainer.querySelector(`[data-coin-number="${coinNumber}"]`);
    if (coinCard) {
      const availableQuantityElement = coinCard.querySelector('.available-quantity');
      const addToCartButton = coinCard.querySelector('.add-to-cart-btn');

      const quantityInCart = cart[coinNumber] ? cart[coinNumber].quantity : 0;
      const newRemaining = totalAvailable - quantityInCart;

      if (availableQuantityElement) {
        availableQuantityElement.textContent = newRemaining;
      }
      if (addToCartButton) {
        if (newRemaining <= 0) {
          addToCartButton.disabled = true;
          addToCartButton.textContent = 'Закончилось';
        } else {
          addToCartButton.disabled = false;
          addToCartButton.textContent = 'Добавить в корзину';
        }
      }
    }
  }

  async function fetchAndDisplayCoins() {
    const coinsContainer = document.getElementById('coins-container');
    if (!coinsContainer) return;

    const currentMaterialFilterValue = materialFilter ? materialFilter.value : '';
    const currentDenominationFilterValue = denominationFilter ? denominationFilter.value : '';
    const currentAvailabilityFilterValue = availabilityFilter ? availabilityFilter.value : '';

    try {
      const allCoinsResponse = await fetch(`${BASE_API_URL}/api/coins`);
      if (!allCoinsResponse.ok) {
        throw new Error(`HTTP error! status: ${allCoinsResponse.status} for all coins`);
      }
      const allCoinsForFilters = await allCoinsResponse.json();
      populateFilterOptions(allCoinsForFilters);
    } catch (error) {
      console.error('Ошибка при загрузке всех монет для фильтров:', error);
    }

    const queryParams = new URLSearchParams();
    if (searchInput && searchInput.value) {
      queryParams.append('search', searchInput.value);
    }
    if (sortSelect && sortSelect.value) {
      const [sortBy, sortOrder] = sortSelect.value.split('_');
      queryParams.append('sort_by', sortBy);
      queryParams.append('sort_order', sortOrder);
    }
    if (materialFilter && currentMaterialFilterValue) {
      materialFilter.value = currentMaterialFilterValue;
      if (!materialFilter.value) {
        materialFilter.value = '';
      }
      if (materialFilter.value) queryParams.append('material', materialFilter.value);
    }
    if (denominationFilter && currentDenominationFilterValue) {
      denominationFilter.value = currentDenominationFilterValue;
      if (!denominationFilter.value) {
        denominationFilter.value = '';
      }
      if (denominationFilter.value) queryParams.append('denomination', denominationFilter.value);
    }
    if (availabilityFilter && currentAvailabilityFilterValue) {
      availabilityFilter.value = currentAvailabilityFilterValue;
      if (!availabilityFilter.value) {
        availabilityFilter.value = '';
      }
      if (availabilityFilter.value) queryParams.append('availability', availabilityFilter.value);
    }

    const apiUrl = `${BASE_API_URL}/api/coins?${queryParams.toString()}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      coinsData = await response.json();

      loadCart();
      displayCoins(coinsData);
      updateCartTotalItemsDisplay();
    } catch (error) {
      console.error('Ошибка при загрузке монет:', error);
      coinsContainer.innerHTML = '<p>Не удалось загрузить каталог монет. Пожалуйста, попробуйте позже.</p>';
    }
  }

  function populateFilterOptions(allCoins) {
    if (!materialFilter || !denominationFilter) return;

    const materials = new Set();
    const denominations = new Set();

    allCoins.forEach(coin => {
      if (coin.material) materials.add(coin.material);
      if (coin.denomination) denominations.add(String(coin.denomination));
    });

    const selectedMaterial = materialFilter.value;
    const selectedDenomination = denominationFilter.value;

    materialFilter.innerHTML = '<option value="">Все</option>';
    Array.from(materials).sort().forEach(material => {
      const option = document.createElement('option');
      option.value = material;
      option.textContent = material;
      materialFilter.appendChild(option);
    });

    denominationFilter.innerHTML = '<option value="">Все</option>';
    Array.from(denominations).sort((a, b) => {
      const numA = parseFloat(a.replace(/[^0-9.]/g, ''));
      const numB = parseFloat(b.replace(/[^0-9.]/g, ''));
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    }).forEach(denomination => {
      const option = document.createElement('option');
      option.value = denomination;
      option.textContent = denomination;
      denominationFilter.appendChild(option);
    });

    materialFilter.value = selectedMaterial;
    denominationFilter.value = selectedDenomination;
  }

  function displayCoins(coins) {
    const coinsContainer = document.getElementById('coins-container');
    if (!coinsContainer) return;

    coinsContainer.innerHTML = '';
    if (coins.length === 0) {
      coinsContainer.innerHTML = '<p>В каталоге пока нет монет, соответствующих вашим критериям.</p>';
      return;
    }

    coins.forEach(coin => {
      const coinCard = document.createElement('div');
      coinCard.classList.add('coin-card');
      coinCard.dataset.coinNumber = coin.number;

      const imageUrl = `/static/images/${coin.file_name}`;

      const quantityInCart = cart[coin.number] ? cart[coin.number].quantity : 0;
      const remainingQuantity = coin.available_quantity - quantityInCart;

      const buttonDisabled = remainingQuantity <= 0;
      const buttonText = remainingQuantity <= 0 ? 'Закончилось' : 'Добавить в корзину';

      coinCard.innerHTML = `
                <img src="${imageUrl}" alt="${coin.name}">
                <h2>${coin.name}</h2>
                <p><strong>Номинал:</strong> ${coin.denomination}</p>
                <p><strong>Металл:</strong> ${coin.material}</p>
                <p><strong>Цена:</strong> ${coin.price} руб.</p>
                <p><strong>Номер:</strong> ${coin.number}</p>
                <div class="quantity">В наличии: <span class="available-quantity">${remainingQuantity}</span> шт.</div>
                <button class="add-to-cart-btn" data-coin-number="${coin.number}" ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>
            `;
      coinsContainer.appendChild(coinCard);
    });

    coinsContainer.querySelectorAll('.add-to-cart-btn').forEach(button => {
      button.addEventListener('click', (event) => {
        const coinNumber = event.target.dataset.coinNumber;
        const coin = coinsData.find(c => c.number === coinNumber);
        if (coin) {
          addToCart(coin);
        }
      });
    });
  }

  function renderCartPage() {
    const cartContainer = document.getElementById('cart-container');
    const cartHeader = document.getElementById('cart-header');
    const emptyCartMessage = document.getElementById('empty-cart-message');
    const checkoutButton = document.getElementById('checkout-button');

    if (!cartContainer) return;

    cartContainer.innerHTML = '';
    const cartItems = Object.values(cart);

    if (cartItems.length === 0) {
      if (cartHeader) cartHeader.style.display = 'none';
      if (emptyCartMessage) emptyCartMessage.style.display = 'block';
      if (checkoutButton) checkoutButton.style.display = 'none';
    } else {
      if (cartHeader) cartHeader.style.display = 'block';
      if (emptyCartMessage) emptyCartMessage.style.display = 'none';
      if (checkoutButton) checkoutButton.style.display = 'block';

      cartItems.forEach(item => {
        const cartItemDiv = document.createElement('div');
        cartItemDiv.classList.add('cart-item');
        cartItemDiv.dataset.coinNumber = item.number;

        cartItemDiv.innerHTML = `
                    <div class="cart-item-info">
                      <span class="cart-item-name">${item.name}</span> (${item.denomination})
                    </div>

                    <div class="cart-item-quantity-controls">
                      <button class="decrease-quantity-btn" data-coin-number="${item.number}">-</button>
                      <span class="cart-item-quantity-display"
                        data-coin-number="${item.number}"
                        contenteditable="true"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        title="Кликните, чтобы изменить количество">${item.quantity}</span>
                      <button class="increase-quantity-btn" data-coin-number="${item.number}">+</button>
                      <button class="remove-from-cart-btn" data-coin-number="${item.number}">Удалить</button>
                    </div>
                  `;
        cartContainer.appendChild(cartItemDiv);
      });

      attachCartEventListeners();
    }
    updateCartTotalItemsDisplay();
  }

  function attachCartEventListeners() {
    const cartContainer = document.getElementById('cart-container');
    if (!cartContainer) return;

    cartContainer.querySelectorAll('.decrease-quantity-btn').forEach(button => {
      button.addEventListener('click', (event) => {
        const coinNumber = event.target.dataset.coinNumber;
        const currentQuantity = cart[coinNumber] ? cart[coinNumber].quantity : 0;
        updateCoinQuantityInCart(coinNumber, currentQuantity - 1);
      });
    });

    cartContainer.querySelectorAll('.increase-quantity-btn').forEach(button => {
      button.addEventListener('click', (event) => {
        const coinNumber = event.target.dataset.coinNumber;
        const currentQuantity = cart[coinNumber] ? cart[coinNumber].quantity : 0;
        updateCoinQuantityInCart(coinNumber, currentQuantity + 1);
      });
    });

    cartContainer.querySelectorAll('.remove-from-cart-btn').forEach(button => {
      button.addEventListener('click', (event) => {
        const coinNumber = event.target.dataset.coinNumber;
        removeFromCart(coinNumber);
      });
    });

    cartContainer.querySelectorAll('.cart-item-quantity-display').forEach(span => {
      span.addEventListener('blur', (event) => {
        updateQuantityFromInput(event.target);
      });
      span.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.target.blur();
        }
      });
    });

    const checkoutButton = document.getElementById('checkout-button');
    if (checkoutButton) {
      checkoutButton.removeEventListener('click', handleCheckout);
      checkoutButton.addEventListener('click', handleCheckout);
    }
  }

  function updateQuantityFromInput(inputElement) {
    const coinNumber = inputElement.dataset.coinNumber;
    let newQuantity = parseInt(inputElement.textContent.trim(), 10);

    if (isNaN(newQuantity)) {
      newQuantity = cart[coinNumber] ? cart[coinNumber].quantity : 0;
    }

    updateCoinQuantityInCart(coinNumber, newQuantity);
    inputElement.textContent = cart[coinNumber] ? cart[coinNumber].quantity : 0;
  }

  async function handleCheckout() {
    if (Object.keys(cart).length === 0) {
      alert('Ваша корзина пуста!');
      return;
    }

    const checkoutButton = document.getElementById('checkout-button');
    if (checkoutButton) {
      checkoutButton.disabled = true;
      checkoutButton.textContent = 'Оформление заказа...';
    }

    // Запрашиваем имя, фамилию и офис
    const userFirstName = prompt("Пожалуйста, введите ваше имя:");
    if (!userFirstName) {
      alert("Имя не введено. Заказ отменен.");
      if (checkoutButton) {
        checkoutButton.disabled = false;
        checkoutButton.textContent = 'Забронировать все монеты';
      }
      return;
    }

    const userLastName = prompt("Пожалуйста, введите вашу фамилию:");
    if (!userLastName) {
      alert("Фамилия не введена. Заказ отменен.");
      if (checkoutButton) {
        checkoutButton.disabled = false;
        checkoutButton.textContent = 'Забронировать все монеты';
      }
      return;
    }

    const userOffice = prompt("Пожалуйста, введите ваш офис:");
    if (!userOffice) {
      alert("Офис не введен. Заказ отменен.");
      if (checkoutButton) {
        checkoutButton.disabled = false;
        checkoutButton.textContent = 'Забронировать все монеты';
      }
      return;
    }

    const orderItems = Object.values(cart).map(item => ({
      number: item.number,
      quantity: item.quantity
    }));

    try {
      const response = await fetch(`${BASE_API_URL}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: orderItems,
          user_first_name: userFirstName,
          user_last_name: userLastName,
          user_office: userOffice
        })
      });

      const result = await response.json();

      if (result.success) {
        alert('Ваш заказ успешно забронирован! Скоро с вами свяжутся.');
        cart = {};
        saveCart();
        renderCartPage();
        if (window.Telegram && window.Telegram.WebApp) {
          Telegram.WebApp.close();
        }
      } else {
        alert(`Ошибка при оформлении заказа: ${result.message}\n${result.details ? JSON.stringify(result.details, null, 2) : ''}`);
        renderCartPage();
      }
    } catch (error) {
      console.error('Ошибка сети при оформлении заказа:', error);
      alert('Произошла ошибка сети. Пожалуйста, попробуйте еще раз.');
    } finally {
      if (checkoutButton) {
        checkoutButton.disabled = false;
        checkoutButton.textContent = 'Забронировать все монеты';
      }
    }
  }

  async function initializePage() {
    if (document.getElementById('coins-container')) {
      await fetchAndDisplayCoins();

      if (searchInput) {
        let debounceTimeout;
        searchInput.addEventListener('input', () => {
          clearTimeout(debounceTimeout);
          debounceTimeout = setTimeout(fetchAndDisplayCoins, 300);
        });
      }
      if (sortSelect) sortSelect.addEventListener('change', fetchAndDisplayCoins);
      if (materialFilter) materialFilter.addEventListener('change', fetchAndDisplayCoins);
      if (denominationFilter) denominationFilter.addEventListener('change', fetchAndDisplayCoins);
      if (availabilityFilter) availabilityFilter.addEventListener('change', fetchAndDisplayCoins);

      const viewCartButton = document.getElementById('view-cart-button');
      if (viewCartButton) {
        viewCartButton.addEventListener('click', () => {
          window.location.href = 'cart.html';
        });
      }
    } else if (document.getElementById('cart-container')) {
      await fetchCoinsForCartPage();
      renderCartPage();

      const backToCatalogButton = document.getElementById('back-to-catalog-button');
      if (backToCatalogButton) {
        backToCatalogButton.addEventListener('click', () => {
          window.location.href = 'index.html';
        });
      }
    }
  }

  async function fetchCoinsForCartPage() {
    try {
      const response = await fetch(`${BASE_API_URL}/api/coins`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      coinsData = await response.json();
      loadCart();
      updateCartTotalItemsDisplay();
    } catch (error) {
      console.error('Ошибка при загрузке монет для корзины:', error);
    }
  }

  initializePage();
});