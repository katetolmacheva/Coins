# -*- coding: utf-8 -*-
import os
import threading
from flask import Flask, render_template, request, jsonify, send_from_directory
import telegram
from telegram import Bot, Update, WebAppInfo, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.orm import sessionmaker, declarative_base
import openpyxl
import asyncio
import platform

# --- Конфигурация ---
TOKEN = "7790860611:AAEJ7y8BJlSRkNhva6Uaxdg04vjIpCU-sbE" # ЗАМЕНИ НА СВОЙ ТОКЕН БОТА ИЗ BOTFATHER!
EXCEL_FILE = 'coins.xlsx'
DATABASE_FILE = 'database.db'
DATABASE_URL = f'sqlite:///{DATABASE_FILE}'

# ID пользователя-администратора для команды обновления данных (ЗАМЕНИ НА СВОЙ ID!)
# Узнать свой ID можно, написав любому боту @userinfobot
ADMIN_USER_ID = 1043419485 # <--- ОБЯЗАТЕЛЬНО ЗАМЕНИ ЭТО НА СВОЙ ID!

app = Flask(__name__, static_folder='static', template_folder='templates') # Убедимся, что Flask знает где template_folder

# --- Настройка SQLAlchemy (База данных) ---
Base = declarative_base()

class Coin(Base):
    """
    Модель данных для монеты, соответствует колонкам в Excel-файле.
    """
    __tablename__ = 'coins'
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)            # Название
    number = Column(String, unique=True, nullable=False) # Номер (код монеты, уникальный)
    available_quantity = Column(Integer, default=0) # Доступное количество
    denomination = Column(String)                    # Номинал
    material = Column(String)                        # Металл (соответствует "Металл")
    price = Column(Float)                            # Цена (тип Float, т.к. может быть с дробью)
    file_name = Column(String)                       # Имя файла (соответствует "Имя файла")

    def __repr__(self):
        return f"<Coin(name='{self.name}', number='{self.number}', quantity={self.available_quantity})>"

# Создание движка базы данных
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine) # Создаем Session-класс здесь, для переиспользования

# --- Функции базы данных ---
def init_db():
    """Создает таблицы в базе данных, если они не существуют."""
    Base.metadata.create_all(engine)
    print("База данных инициализирована.")

# Список обязательных колонок в Excel-файле
REQUIRED_EXCEL_COLUMNS = [
    'Название',
    'Номер',
    'Доступное количество',
    'Номинал',
    'Металл',
    'Цена',
    'Имя файла'
]

def sync_excel_to_db():
    """Синхронизирует данные из Excel-файла с базой данных."""
    print("Начинаю синхронизацию данных из Excel...")
    session = Session()
    try:
        if not os.path.exists(EXCEL_FILE):
            print(f"Ошибка: Файл Excel '{EXCEL_FILE}' не найден.")
            return

        workbook = openpyxl.load_workbook(EXCEL_FILE)
        sheet = workbook.active
        header = [cell.value for cell in sheet[1]]

        # Проверка на наличие всех обязательных колонок
        for col in REQUIRED_EXCEL_COLUMNS:
            if col not in header:
                raise ValueError(f"Не найдена обязательная колонка в Excel-файле: {col}")

        # Очищаем таблицу перед новой загрузкой
        session.query(Coin).delete()
        session.commit()

        for row_index in range(2, sheet.max_row + 1): # Начинаем со второй строки (после заголовков)
            row_data = {header[i]: sheet.cell(row=row_index, column=i+1).value for i in range(len(header))}
            
            # Приведение к правильным типам данных
            try:
                available_quantity = int(row_data.get('Доступное количество', 0) or 0)
            except (ValueError, TypeError):
                available_quantity = 0 # Устанавливаем 0, если не число

            try:
                price = float(str(row_data.get('Цена', 0.0)).replace(',', '.') or 0.0) # Заменяем запятую на точку и конвертируем в float
            except (ValueError, TypeError):
                price = 0.0 # Устанавливаем 0.0, если не число

            coin = Coin(
                name=row_data.get('Название'),
                number=row_data.get('Номер'),
                available_quantity=available_quantity,
                denomination=row_data.get('Номинал'),
                material=row_data.get('Металл'),
                price=price,
                file_name=row_data.get('Имя файла')
            )
            session.add(coin)
            
        session.commit()
        print("Данные успешно синхронизированы из Excel в базу данных.")

    except ValueError as e:
        print(f"Ошибка при синхронизации данных из Excel: {e}")
        session.rollback()
    except Exception as e:
        print(f"Произошла непредвиденная ошибка при синхронизации Excel: {e}")
        session.rollback()
    finally:
        session.close()

# get_all_coins теперь не нужен, так как get_coins будет обрабатывать параметры напрямую
# def get_all_coins():
#     """Возвращает список всех монет из базы данных."""
#     session = Session()
#     try:
#         coins = session.query(Coin).all()
#         return [
#             {
#                 'name': c.name,
#                 'number': c.number,
#                 'available_quantity': c.available_quantity,
#                 'denomination': c.denomination,
#                 'material': c.material,
#                 'price': c.price,
#                 'file_name': c.file_name
#             }
#             for c in coins
#         ]
#     finally:
#         session.close()

# --- Маршруты Flask ---
@app.route('/')
@app.route('/index.html')
def index():
    """Главная страница WebApp."""
    return render_template('index.html')

@app.route('/cart.html')
def cart():
    return render_template('cart.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    # Убедитесь, что 'static_folder' правильно определен в App
    return send_from_directory(app.static_folder, filename)

@app.route('/api/coins', methods=['GET'])
def get_coins():
    """API-маршрут для получения списка монет с фильтрацией и сортировкой."""
    session = Session()
    try:
        query = session.query(Coin)

        # --- Получаем параметры из запроса ---
        search_query = request.args.get('search', '').lower()
        sort_by = request.args.get('sort_by', 'name') # По умолчанию сортировка по названию
        sort_order = request.args.get('sort_order', 'asc') # По умолчанию по возрастанию
        material_filter = request.args.get('material', '')
        denomination_filter = request.args.get('denomination', '')
        availability_filter = request.args.get('availability', '')

        # --- Применяем поиск ---
        if search_query:
            query = query.filter(
                (Coin.name.ilike(f'%{search_query}%')) | # Поиск по названию (без учета регистра)
                (Coin.number.ilike(f'%{search_query}%')) # Поиск по номеру
            )

        # --- Применяем фильтры ---
        if material_filter:
            query = query.filter(Coin.material == material_filter)

        if denomination_filter:
            query = query.filter(Coin.denomination == denomination_filter)

        if availability_filter:
            if availability_filter == 'in_stock':
                query = query.filter(Coin.available_quantity > 0)
            elif availability_filter == 'out_of_stock':
                query = query.filter(Coin.available_quantity <= 0)

        # --- Применяем сортировку ---
        if sort_by == 'name':
            if sort_order == 'desc':
                query = query.order_by(Coin.name.desc())
            else:
                query = query.order_by(Coin.name.asc())
        elif sort_by == 'price':
            if sort_order == 'desc':
                query = query.order_by(Coin.price.desc())
            else:
                query = query.order_by(Coin.price.asc())
        # Добавьте другие критерии сортировки, если необходимо (например, по номеру)
        # elif sort_by == 'number':
        #     if sort_order == 'desc':
        #         query = query.order_by(Coin.number.desc())
        #     else:
        #         query = query.order_by(Coin.number.asc())

        coins = query.all()

        # Преобразуем объекты Coin в словари для JSON-ответа
        coins_data = [
            {
                'name': c.name,
                'number': c.number,
                'available_quantity': c.available_quantity,
                'denomination': c.denomination,
                'material': c.material,
                'price': c.price,
                'file_name': c.file_name
            }
            for c in coins
        ]
        return jsonify(coins_data)

    except Exception as e:
        print(f"Ошибка при получении монет: {e}")
        return jsonify({'error': 'Ошибка сервера при получении данных'}), 500
    finally:
        session.close()


@app.route('/api/reserve/<string:coin_number>', methods=['POST'])
def reserve_coin(coin_number):
    """API-маршрут для бронирования одной монеты."""
    session = Session()
    try:
        coin = session.query(Coin).filter_by(number=coin_number).first()
        if coin and coin.available_quantity > 0:
            coin.available_quantity -= 1
            session.commit()
            return jsonify({'success': True, 'new_quantity': coin.available_quantity})
        elif coin and coin.available_quantity == 0:
            return jsonify({'success': False, 'message': 'Монета закончилась.'})
        else:
            return jsonify({'success': False, 'message': 'Монета не найдена.'})
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'message': f'Ошибка бронирования: {str(e)}'})
    finally:
        session.close()

@app.route('/api/checkout', methods=['POST'])
def checkout():
    """API-маршрут для оформления заказа из корзины."""
    data = request.get_json()
    items_to_reserve = data.get('items', [])
    
    session = Session()
    
    results = []
    success_all = True
    
    try:
        for item in items_to_reserve:
            coin_number = item.get('number')
            quantity = item.get('quantity', 1)
            
            coin = session.query(Coin).filter_by(number=str(coin_number)).first() # Убедимся, что номер как строка
            
            if not coin:
                results.append({'number': coin_number, 'success': False, 'message': 'Монета не найдена.'})
                success_all = False
                continue
            
            if coin.available_quantity < quantity:
                results.append({
                    'number': coin_number, 
                    'success': False, 
                    'message': f'Недостаточно монет в наличии для "{coin.name}". Доступно: {coin.available_quantity}, Запрошено: {quantity}.'
                })
                success_all = False
                continue
            
            coin.available_quantity -= quantity
            session.add(coin) # Обновляем объект в сессии
            results.append({'number': coin_number, 'success': True, 'new_quantity': coin.available_quantity})
            
        if success_all:
            session.commit()
            # Добавим логирование заказа в отдельный файл, если нужно
            # В данном случае, это можно реализовать так же, как в предыдущем app.py,
            # но для текущего запроса я оставлю это за рамками, чтобы не усложнять
            # и сосредоточиться на фильтрации/сортировке.
            # Если вам нужно сохранить историю заказов в файл, дайте знать.
            return jsonify({'success': True, 'message': 'Заказ успешно оформлен!', 'details': results})
        else:
            session.rollback() # Откатываем все изменения, если хоть одна позиция не может быть зарезервирована
            return jsonify({'success': False, 'message': 'Не удалось оформить весь заказ. Проверьте детали.', 'details': results})
            
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'message': f'Произошла ошибка при оформлении заказа: {str(e)}', 'details': []})
    finally:
        session.close()


# --- Функции Telegram бота ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Отправляет сообщение при команде /start с кнопкой WebApp."""
    
    # URL вашей Flask-приложения. Если вы используете ngrok, он будет выглядеть примерно так:
    # WEBAPP_URL = "https://your-ngrok-url.ngrok-free.app"
    # Для локального тестирования без ngrok (если Flask запущен на 0.0.0.0:5000):
    # Убедитесь, что этот URL доступен из Telegram. На публичном хостинге это будет URL вашего домена.
    WEBAPP_URL = "http://127.0.0.1:5000" # Или URL вашего публичного сервера/ngrok

    keyboard = [
        [KeyboardButton("Открыть каталог монет", web_app=WebAppInfo(url=WEBAPP_URL))]
    ]
    reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=False)
    
    await update.message.reply_text(
        "Добро пожаловать в каталог монет! Нажмите кнопку ниже, чтобы просмотреть ассортимент.",
        reply_markup=reply_markup
    )

async def update_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обновляет данные из Excel-файла (только для администратора)."""
    if update.effective_user.id != ADMIN_USER_ID:
        await update.message.reply_text("У вас нет прав для выполнения этой команды.")
        return

    await update.message.reply_text("Начинаю синхронизацию данных из Excel... Это может занять несколько секунд.")
    sync_excel_to_db()
    await update.message.reply_text("Синхронизация данных из Excel завершена!")

# --- Запуск приложения ---
async def main():
    """Основная асинхронная функция для запуска бота и Flask-сервера."""
    # Инициализируем базу данных при запуске
    init_db()
    # Синхронизируем данные из Excel при первом запуске
    sync_excel_to_db()

    application = Application.builder().token(TOKEN).build()

    # Добавляем обработчики команд
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("update_excel_data", update_data))

    # Запуск Flask-сервера в отдельном потоке
    def run_flask():
        app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False) 

    flask_thread = threading.Thread(target=run_flask)
    flask_thread.start()
    print("Запуск Flask-приложения на порту 5000...")

    # Запуск Telegram бота
    print("Запуск Telegram бота (polling)...")
    await application.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True, timeout=30)


if __name__ == '__main__':
    # Эта часть необходима для корректной работы asyncio на Windows
    if platform.system() == "Windows":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    try:
        # Запускаем основную асинхронную функцию
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Приложение остановлено пользователем.")
    except Exception as e:
        print(f"Произошла фатальная ошибка: {e}")