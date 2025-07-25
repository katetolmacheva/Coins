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
        cart = {}; // Очищаем текущую корзину перед загрузкой
        for (const coinNumber in parsedCart) {
          const savedItem = parsedCart[coinNumber];
          const originalCoin = coinsData.find(c => c.number === coinNumber);
          if (originalCoin) {
            // Валидация количества при загрузке: не больше, чем доступно
            let quantityToLoad = savedItem.quantity;
            if (quantityToLoad > originalCoin.available_quantity) {
              quantityToLoad = originalCoin.available_quantity;
              console.warn(`Количество монеты ${coinNumber} скорректировано до доступного: ${quantityToLoad}`);
            }
            if (quantityToLoad > 0) { // Только если количество больше 0
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
    const currentQuantityInCart = cart[coin.number] ? cart[coin.number].quantity : 0;
    // Если текущее количество в корзине + 1 не превышает доступное
    if (currentQuantityInCart + 1 <= coin.available_quantity) {
      if (cart[coin.number]) {
        cart[coin.number].quantity++;
      } else {
        cart[coin.number] = { ...coin, quantity: 1 };
      }
      saveCart();
      updateCartUI(); // Обновляем весь UI корзины и карточек монет
    } else {
      alert('Вы достигли максимального количества этой монеты в наличии.');
    }
  }

  // НОВАЯ/ИСПРАВЛЕННАЯ ФУНКЦИЯ: Обновление количества монеты в корзине
  // Эту функцию можно использовать для кнопок +/- и для прямого ввода
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
      // Если пользователь пытался добавить больше, чем есть, сообщаем ему
      alert('Вы достигли максимального количества этой монеты в наличии.');
    }

    // Применяем изменения к корзине
    if (newQuantity === 0) {
      delete cart[coinNumber]; // Если количество стало 0, удаляем из корзины
    } else {
      // Если монеты еще нет в корзине, но пытаемся установить количество > 0
      if (!cart[coinNumber]) {
        cart[coinNumber] = { ...originalCoin, quantity: newQuantity };
      } else {
        cart[coinNumber].quantity = newQuantity;
      }
    }
    saveCart();
    updateCartUI(); // Обновляем весь UI
  }

  // Удаление монеты из корзины (полностью)
  function removeFromCart(coinNumber) {
    if (cart[coinNumber]) {
      delete cart[coinNumber];
      saveCart();
      updateCartUI();
    }
  }

  // НОВАЯ ФУНКЦИЯ: Обновляет ВЕСЬ UI корзины и всех карточек монет
  function updateCartUI() {
    renderCart(); // Перерисовываем корзину
    // Проходимся по всем монетам и обновляем их карточки в каталоге
    coinsData.forEach(coin => {
      updateCoinCardQuantity(coin.number, coin.available_quantity);
    });
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

      // Обработчики для кнопок уменьшения количества (-)
      cartContainer.querySelectorAll('.decrease-quantity-btn').forEach(button => {
        button.addEventListener('click', (event) => {
          const coinNumber = event.target.dataset.coinNumber;
          const currentQuantity = cart[coinNumber] ? cart[coinNumber].quantity : 0;
          // Вызываем updateCoinQuantityInCart с уменьшенным количеством
          updateCoinQuantityInCart(coinNumber, currentQuantity - 1);
        });
      });

      // Обработчики для кнопок увеличения количества (+)
      cartContainer.querySelectorAll('.increase-quantity-btn').forEach(button => {
        button.addEventListener('click', (event) => {
          const coinNumber = event.target.dataset.coinNumber;
          const currentQuantity = cart[coinNumber] ? cart[coinNumber].quantity : 0;
          // Вызываем updateCoinQuantityInCart с увеличенным количеством
          updateCoinQuantityInCart(coinNumber, currentQuantity + 1);
        });
      });

      // Обработчики для кнопок удаления
      cartContainer.querySelectorAll('.remove-from-cart-btn').forEach(button => {
        button.addEventListener('click', (event) => {
          const coinNumber = event.target.dataset.coinNumber;
          removeFromCart(coinNumber);
        });
      });

      // Обработчики для полей ввода количества
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
    }
  }

  function updateQuantityFromInput(inputElement) {
    const coinNumber = inputElement.dataset.coinNumber;
    let newQuantity = parseInt(inputElement.textContent.trim(), 10);

    const coin = coinsData.find(c => c.number === coinNumber);

    if (!coin) {
      console.error('Монета не найдена для обновления количества:', coinNumber);
      // Возвращаем старое значение, если монета не найдена
      inputElement.textContent = cart[coinNumber] ? cart[coinNumber].quantity : 0;
      return;
    }

    // Валидация введенного значения. updateCoinQuantityInCart уже сделает полную валидацию.
    // Здесь лишь предварительная обработка некорректного ввода.
    if (isNaN(newQuantity)) {
      newQuantity = cart[coinNumber] ? cart[coinNumber].quantity : 0; // Возвращаем текущее количество
    }

    // Вызываем основную функцию обновления количества, она сделает все проверки
    updateCoinQuantityInCart(coinNumber, newQuantity);

    // Обновляем текст в span, так как updateCoinQuantityInCart могла скорректировать значение
    inputElement.textContent = cart[coinNumber] ? cart[coinNumber].quantity : 0;
  }

  // --- Загрузка и отображение монет (модифицировано) ---
  async function fetchCoins() {
    try {
      const response = await fetch(`${BASE_API_URL}/api/coins`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      coinsData = await response.json();
      loadCart(); // Загружаем корзину после получения данных о монетах
      displayCoins(coinsData);
      updateCartUI(); // Обновляем UI после загрузки всех данных
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
        const coin = coins.find(c => c.number === coinNumber);
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
        await fetchCoins(); // Перезагружаем монеты, чтобы обновить наличие
        if (window.Telegram && window.Telegram.WebApp) {
          Telegram.WebApp.close();
        }
      } else {
        alert(`Ошибка при оформлении заказа: ${result.message}\n${result.details ? JSON.stringify(result.details, null, 2) : ''}`);
        await fetchCoins(); // Перезагружаем монеты, чтобы показать актуальные остатки
      }
    } catch (error) {
      console.error('Ошибка сети при оформлении заказа:', error);
      alert('Произошла ошибка сети. Пожалуйста, попробуйте еще раз.');
    } finally {
      checkoutButton.disabled = false;
      checkoutButton.textContent = 'Забронировать все монеты';
    }
  });

  function updateCartUI() {
    renderCart(); // Перерисовываем корзину
    // Проходимся по всем монетам и обновляем их карточки в каталоге
    coinsData.forEach(coin => {
      updateCoinCardQuantity(coin.number, coin.available_quantity);
    });
  }

  // Инициализация: загружаем монеты при старте
  fetchCoins();
});