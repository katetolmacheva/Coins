document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    // Закомментируй эти строки, если они были раскомментированы в процессе отладки,
    // чтобы CSS-переменные из style.css работали корректно.
    // Telegram.WebApp.setHeaderColor(Telegram.WebApp.themeParams.secondary_bg_color);
    // Telegram.WebApp.setBackgroundColor(Telegram.WebApp.themeParams.bg_color);
  }

  const coinsContainer = document.getElementById('coins-container');
  const cartHeader = document.getElementById('cart-header');
  const cartContainer = document.getElementById('cart-container');
  const emptyCartMessage = document.getElementById('empty-cart-message');
  const checkoutButton = document.getElementById('checkout-button');

  // Определяем базовый URL для API-запросов
  // Если Telegram WebApp, используем его URL, иначе - текущий origin (для локального тестирования)
  const BASE_API_URL = (window.Telegram && window.Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param)
    ? window.location.origin
    : ''; // Если WebApp открыт через Ngrok, window.location.origin уже будет Ngrok URL.
  // Если он пустой, запросы будут относительными, что тоже сработает с Ngrok.

  // --- Управление корзиной ---
  let cart = {}; // Объект для хранения монет в корзине: { 'номер_монеты': { coinData, quantity } }
  let coinsData = []; // Переменная для хранения всех загруженных монет из API

  // Загрузка корзины из localStorage при старте
  function loadCart() {
    const savedCart = localStorage.getItem('coinCart');
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        cart = {};
        for (const coinNumber in parsedCart) {
          const savedItem = parsedCart[coinNumber];
          const originalCoin = coinsData.find(c => c.number === coinNumber);
          if (originalCoin && savedItem.quantity > 0 && savedItem.quantity <= originalCoin.available_quantity) {
            cart[coinNumber] = { ...originalCoin, quantity: savedItem.quantity };
          } else if (originalCoin && savedItem.quantity > originalCoin.available_quantity) {
            cart[coinNumber] = { ...originalCoin, quantity: originalCoin.available_quantity };
          }
        }
      } catch (e) {
        console.error("Ошибка при парсинге корзины из localStorage:", e);
        cart = {};
      }
    }
  }

  // Сохранение корзины в localStorage
  function saveCart() {
    const simplifiedCart = {};
    for (const coinNumber in cart) {
      simplifiedCart[coinNumber] = { quantity: cart[coinNumber].quantity };
    }
    localStorage.setItem('coinCart', JSON.stringify(simplifiedCart));
  }

  // Добавление монеты в корзину
  function addToCart(coin) {
    if (cart[coin.number]) {
      if (cart[coin.number].quantity < coin.available_quantity) {
        cart[coin.number].quantity++;
      } else {
        alert('Вы достигли максимального количества этой монеты в наличии.');
        return;
      }
    } else {
      cart[coin.number] = { ...coin, quantity: 1 };
    }
    saveCart();
    renderCart();
    updateCoinCardQuantity(coin.number, coin.available_quantity);
  }

  // Обновление количества монеты в корзине
  function updateCartQuantity(coinNumber, change) {
    if (cart[coinNumber]) {
      cart[coinNumber].quantity += change;

      const originalCoin = coinsData.find(c => c.number === coinNumber);

      if (cart[coinNumber].quantity <= 0) {
        delete cart[coinNumber];
      } else if (originalCoin && cart[coinNumber].quantity > originalCoin.available_quantity) {
        cart[coinNumber].quantity = originalCoin.available_quantity;
        alert('Вы достигли максимального количества этой монеты в наличии.');
      }
      saveCart();
      renderCart();
      if (originalCoin) {
        updateCoinCardQuantity(coinNumber, originalCoin.available_quantity);
      }
    }
  }

  // Удаление монеты из корзины (полностью, не уменьшая количество)
  function removeFromCart(coinNumber) {
    if (cart[coinNumber]) {
      delete cart[coinNumber];
      saveCart();
      renderCart();
      const originalCoin = coinsData.find(c => c.number === coinNumber);
      if (originalCoin) {
        updateCoinCardQuantity(coinNumber, originalCoin.available_quantity);
      }
    }
  }

  // Отображение корзины
  function renderCart() {
    cartContainer.innerHTML = '';
    const cartItems = Object.values(cart);

    if (cartItems.length === 0) {
      cartHeader.style.display = 'none';
      emptyCartMessage.style.display = 'block';
      checkoutButton.style.display = 'none';
    } else {
      cartHeader.style.display = 'block';
      emptyCartMessage.style.display = 'none';
      checkoutButton.style.display = 'block';

      cartItems.forEach(item => {
        const cartItemDiv = document.createElement('div');
        cartItemDiv.classList.add('cart-item');
        cartItemDiv.dataset.coinNumber = item.number;

        cartItemDiv.innerHTML = `
          <div class="cart-item-info">
            <span class="cart-item-name">${item.name}</span> (${item.denomination})
          </div>
          <div class="cart-item-quantity-controls">
            <button class="remove-from-cart-btn" data-coin-number="${item.number}">-</button>
            <span class="cart-item-quantity-display">${item.quantity}</span>
            <button class="add-to-cart-btn" data-coin-number="${item.number}">+</button>
          </div>
        `;
        cartContainer.appendChild(cartItemDiv);
      });

      cartContainer.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', (event) => {
          const coinNumber = event.target.dataset.coinNumber;
          updateCartQuantity(coinNumber, 1);
        });
      });
      cartContainer.querySelectorAll('.remove-from-cart-btn').forEach(button => {
        button.addEventListener('click', (event) => {
          const coinNumber = event.target.dataset.coinNumber;
          updateCartQuantity(coinNumber, -1);
        });
      });
    }
  }

  // --- Загрузка и отображение монет (модифицировано) ---
  async function fetchCoins() {
    try {
      // ИСПОЛЬЗУЕМ BASE_API_URL ЗДЕСЬ
      const response = await fetch(`${BASE_API_URL}/api/coins`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      coinsData = await response.json();
      loadCart();
      displayCoins(coinsData);
      renderCart();
    } catch (error) {
      console.error('Ошибка при загрузке монет:', error);
      coinsContainer.innerHTML = '<p>Не удалось загрузить каталог монет. Пожалуйста, попробуйте позже.</p>';
    }
  }

  function displayCoins(coins) {
    coinsContainer.innerHTML = '';
    if (coins.length === 0) {
      coinsContainer.innerHTML = '<p>В каталоге пока нет монет.</p>';
      return;
    }

    coins.forEach(coin => {
      const coinCard = document.createElement('div');
      coinCard.classList.add('coin-card');
      coinCard.dataset.coinNumber = coin.number;

      // *** ИСПРАВЛЕНИЕ ЗДЕСЬ: используем coin.file_name для формирования URL ***
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
      <button class="add-to-cart-btn" ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>
    `;
      coinsContainer.appendChild(coinCard);
    });

    coinsContainer.querySelectorAll('.add-to-cart-btn').forEach(button => {
      button.addEventListener('click', (event) => {
        const coinNumber = event.target.closest('.coin-card').dataset.coinNumber;
        // Используем coinsData, если она загружена глобально, или fetchCoins заново.
        // Предполагается, что coinsData содержит актуальный список монет.
        const coin = coins.find(c => c.number === coinNumber); // Используем coins из параметра функции
        if (coin) {
          addToCart(coin);
        }
      });
    });
  }
  function updateCoinCardQuantity(coinNumber, totalAvailable) {
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

  // --- Функция оформления заказа ---
  checkoutButton.addEventListener('click', async () => {
    if (Object.keys(cart).length === 0) {
      alert('Ваша корзина пуста!');
      return;
    }

    checkoutButton.disabled = true;
    checkoutButton.textContent = 'Оформление заказа...';

    const orderItems = Object.values(cart).map(item => ({
      number: item.number,
      quantity: item.quantity
    }));

    try {
      // ИСПОЛЬЗУЕМ BASE_API_URL ЗДЕСЬ
      const response = await fetch(`${BASE_API_URL}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: orderItems })
      });

      const result = await response.json();

      if (result.success) {
        alert('Ваш заказ успешно забронирован!');
        cart = {};
        saveCart();
        await fetchCoins();
        if (window.Telegram && window.Telegram.WebApp) {
          Telegram.WebApp.close();
        }
      } else {
        alert(`Ошибка при оформлении заказа: ${result.message}\n${result.details ? JSON.stringify(result.details, null, 2) : ''}`);
        await fetchCoins();
      }
    } catch (error) {
      console.error('Ошибка сети при оформлении заказа:', error);
      alert('Произошла ошибка сети. Пожалуйста, попробуйте еще раз.');
    } finally {
      checkoutButton.disabled = false;
      checkoutButton.textContent = 'Забронировать все монеты';
    }
  });

  // Инициализация: загружаем монеты при старте
  fetchCoins();
});