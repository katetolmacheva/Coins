document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
  }

  const BASE_API_URL = (window.Telegram && window.Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param)
    ? window.location.origin
    : '';

  let cart = {}; // Объект для хранения монет в корзине: { 'номер_монеты': { coinData, quantity } }
  let coinsData = []; // Переменная для хранения всех загруженных монет из API

  // --- Вспомогательные функции для работы с localStorage ---
  function loadCart() {
    const savedCart = localStorage.getItem('coinCart');
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        cart = {}; // Очищаем текущую корзину перед загрузкой
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
    updateCartTotalItemsDisplay(); // Обновляем счетчик товаров в корзине
  }

  function updateCartTotalItemsDisplay() {
    const totalItemsSpan = document.getElementById('cart-total-items');
    if (totalItemsSpan) {
      const totalItems = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
      totalItemsSpan.textContent = totalItems;
    }
  }

  // --- Основные функции для работы с монетами и корзиной ---

  // Функция добавления монеты в корзину (с проверками)
  function addToCart(coin) {
    const currentQuantityInCart = cart[coin.number] ? cart[coin.number].quantity : 0;
    if (currentQuantityInCart + 1 <= coin.available_quantity) {
      if (cart[coin.number]) {
        cart[coin.number].quantity++;
      } else {
        cart[coin.number] = { ...coin, quantity: 1 };
      }
      saveCart();
      // Обновляем количество на карточке монеты только если мы на главной странице
      if (document.getElementById('coins-container')) {
        updateCoinCardQuantity(coin.number, coin.available_quantity);
      }
    } else {
      alert('Вы достигли максимального количества этой монеты в наличии.');
    }
  }

  // Обновление количества монеты в корзине (для кнопок +/- и ручного ввода)
  function updateCoinQuantityInCart(coinNumber, newQuantity) {
    const originalCoin = coinsData.find(c => c.number === coinNumber);

    if (!originalCoin) {
      console.error('Монета не найдена для обновления количества:', coinNumber);
      return;
    }

    // 1. Ограничиваем минимальное количество нулем
    if (newQuantity < 0) {
      newQuantity = 0;
    }

    // 2. Ограничиваем максимальное количество доступным на складе
    if (newQuantity > originalCoin.available_quantity) {
      newQuantity = originalCoin.available_quantity;
      alert('Вы достигли максимального количества этой монеты в наличии.');
    }

    if (newQuantity === 0) {
      delete cart[coinNumber]; // Если количество стало 0, удаляем из корзины
    } else {
      if (!cart[coinNumber]) {
        cart[coinNumber] = { ...originalCoin, quantity: newQuantity };
      } else {
        cart[coinNumber].quantity = newQuantity;
      }
    }
    saveCart();
    renderCartPage(); // Перерисовываем корзину на странице корзины (если на ней)
    // Обновляем карточку на главной, если пользователь там
    if (document.getElementById('coins-container')) {
      updateCoinCardQuantity(coinNumber, originalCoin.available_quantity);
    }
  }

  // Удаление монеты из корзины (полностью)
  function removeFromCart(coinNumber) {
    const originalCoin = coinsData.find(c => c.number === coinNumber);
    if (cart[coinNumber]) {
      delete cart[coinNumber];
      saveCart();
      renderCartPage(); // Перерисовываем корзину
      // Обновляем карточку на главной, если пользователь там
      if (document.getElementById('coins-container') && originalCoin) {
        updateCoinCardQuantity(coinNumber, originalCoin.available_quantity);
      }
    }
  }

  // Обновляет количество и состояние кнопки на карточке монеты в каталоге
  function updateCoinCardQuantity(coinNumber, totalAvailable) {
    const coinsContainer = document.getElementById('coins-container');
    if (!coinsContainer) return; // Убедимся, что мы на странице каталога

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

  // --- Функции рендеринга и инициализации страниц ---

  // Загрузка и отображение монет на главной странице
  async function fetchAndDisplayCoins() {
    const coinsContainer = document.getElementById('coins-container');
    if (!coinsContainer) return; // Выходим, если не на главной странице

    try {
      const response = await fetch(`${BASE_API_URL}/api/coins`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      coinsData = await response.json();
      loadCart(); // Загружаем корзину после получения данных о монетах
      displayCoins(coinsData); // Только здесь вызываем displayCoins
      updateCartTotalItemsDisplay(); // Обновляем счетчик на кнопке корзины
    } catch (error) {
      console.error('Ошибка при загрузке монет:', error);
      coinsContainer.innerHTML = '<p>Не удалось загрузить каталог монет. Пожалуйста, попробуйте позже.</p>';
    }
  }

  function displayCoins(coins) {
    const coinsContainer = document.getElementById('coins-container');
    if (!coinsContainer) return; // Убедимся, что coinsContainer существует

    coinsContainer.innerHTML = '';
    if (coins.length === 0) {
      coinsContainer.innerHTML = '<p>В каталоге пока нет монет.</p>';
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

    // Добавляем обработчики для кнопок "Добавить в корзину"
    coinsContainer.querySelectorAll('.add-to-cart-btn').forEach(button => {
      button.addEventListener('click', (event) => {
        const coinNumber = event.target.dataset.coinNumber;
        const coin = coinsData.find(c => c.number === coinNumber); // Используем coinsData
        if (coin) {
          addToCart(coin);
        }
      });
    });
  }

  // Отображение корзины на странице cart.html
  function renderCartPage() {
    const cartContainer = document.getElementById('cart-container');
    const cartHeader = document.getElementById('cart-header');
    const emptyCartMessage = document.getElementById('empty-cart-message');
    const checkoutButton = document.getElementById('checkout-button');

    if (!cartContainer) return; // Убедимся, что мы на странице корзины

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

      // Добавляем обработчики событий после рендеринга
      attachCartEventListeners();
    }
    updateCartTotalItemsDisplay(); // Обновляем счетчик на кнопке корзины (если она видна на этой странице, или если это кнопка "назад")
  }

  // Прикрепление обработчиков событий для элементов корзины
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
      // Удаляем старый обработчик, чтобы избежать дублирования, если он был
      checkoutButton.removeEventListener('click', handleCheckout);
      // Добавляем новый
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
    // Обновляем текст в span, так как updateCoinQuantityInCart могла скорректировать значение
    inputElement.textContent = cart[coinNumber] ? cart[coinNumber].quantity : 0;
  }

  // Обработчик для кнопки оформления заказа
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
        body: JSON.stringify({ items: orderItems })
      });

      const result = await response.json();

      if (result.success) {
        alert('Ваш заказ успешно забронирован!');
        cart = {};
        saveCart();
        // На главной странице обновим карточки (если пользователь вернется туда)
        // Не вызываем fetchAndDisplayCoins() здесь, чтобы не рендерить лишний раз
        // Это будет сделано при загрузке index.html
        renderCartPage(); // Обновим корзину на странице корзины (она станет пустой)
        if (window.Telegram && window.Telegram.WebApp) {
          Telegram.WebApp.close();
        }
      } else {
        alert(`Ошибка при оформлении заказа: ${result.message}\n${result.details ? JSON.stringify(result.details, null, 2) : ''}`);
        // В случае ошибки, обновим и каталог, и корзину, чтобы показать актуальные остатки
        // Тоже не вызываем fetchAndDisplayCoins() напрямую
        renderCartPage(); // Обновляем корзину, чтобы показать актуальные остатки
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


  // --- Инициализация в зависимости от текущей страницы ---
  async function initializePage() {
    if (document.getElementById('coins-container')) {
      // Мы на главной странице каталога
      await fetchAndDisplayCoins(); // Загружаем монеты и инициализируем отображение

      const viewCartButton = document.getElementById('view-cart-button');
      if (viewCartButton) {
        viewCartButton.addEventListener('click', () => {
          window.location.href = 'cart.html'; // Переход на страницу корзины
        });
      }
    } else if (document.getElementById('cart-container')) {
      // Мы на странице корзины
      await fetchCoinsForCartPage(); // Загружаем монеты (данные) для корзины
      renderCartPage(); // Отображаем корзину

      const backToCatalogButton = document.getElementById('back-to-catalog-button');
      if (backToCatalogButton) {
        backToCatalogButton.addEventListener('click', () => {
          window.location.href = 'index.html'; // Переход обратно на главную
        });
      }
    }
  }

  // Функция для загрузки coinsData на странице корзины (без отображения)
  async function fetchCoinsForCartPage() {
    try {
      const response = await fetch(`${BASE_API_URL}/api/coins`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      coinsData = await response.json();
      loadCart(); // Загружаем корзину после получения данных о монетах
      // Здесь НЕ вызываем displayCoins, так как это страница корзины
      updateCartTotalItemsDisplay(); // Обновляем счетчик на кнопке корзины (если она присутствует, например, на кнопке "Назад")
    } catch (error) {
      console.error('Ошибка при загрузке монет для корзины:', error);
      // Если не удалось загрузить монеты, корзина может быть неактуальной, но продолжим работать с тем, что есть
    }
  }

  function updateCartUI() {
    renderCart(); // Перерисовываем корзину
    // Проходимся по всем монетам и обновляем их карточки в каталоге
    coinsData.forEach(coin => {
      updateCoinCardQuantity(coin.number, coin.available_quantity);
    });
  }

  // Запускаем инициализацию страницы
  initializePage();
});