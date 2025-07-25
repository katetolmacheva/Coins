import os
import threading
import asyncio
from flask import Flask, render_template, request, jsonify, send_from_directory
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.orm import sessionmaker, declarative_base
import openpyxl
from openpyxl.utils import get_column_letter
import platform
import logging
import datetime
import re

logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Конфигурация ---
EXCEL_FILE = 'coins.xlsx'
ORDERS_EXCEL_FILE = 'orders.xlsx'
DATABASE_FILE = 'database.db'
DATABASE_URL = f'sqlite:///{DATABASE_FILE}'

app = Flask(__name__, static_folder='static', template_folder='templates')

# --- Настройка SQLAlchemy (База данных) ---
Base = declarative_base()

class Coin(Base):
    __tablename__ = 'coins'
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    number = Column(String, unique=True, nullable=False)
    available_quantity = Column(Integer, default=0)
    denomination = Column(String)
    material = Column(String)
    price = Column(Float)
    file_name = Column(String)

    def __repr__(self):
        return f"<Coin(name='{self.name}', number='{self.number}', quantity={self.available_quantity})>"

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

def init_db():
    Base.metadata.create_all(engine)
    logging.info("База данных инициализирована.")

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
    logging.info("Начинаю синхронизацию данных из Excel...")
    session = Session()
    try:
        if not os.path.exists(EXCEL_FILE):
            logging.error(f"Ошибка: Файл Excel '{EXCEL_FILE}' не найден.")
            return

        workbook = openpyxl.load_workbook(EXCEL_FILE)
        sheet = workbook.active
        header = [cell.value for cell in sheet[1]]

        for col in REQUIRED_EXCEL_COLUMNS:
            if col not in header:
                raise ValueError(f"Не найдена обязательная колонка в Excel-файле: {col}")

        session.query(Coin).delete()
        session.commit()
        logging.info("Существующие данные в базе данных очищены.")

        for row_index in range(2, sheet.max_row + 1):
            row_data = {header[i]: sheet.cell(row=row_index, column=i+1).value for i in range(len(header))}
            
            try:
                available_quantity = int(row_data.get('Доступное количество', 0) or 0)
            except (ValueError, TypeError):
                available_quantity = 0
                logging.warning(f"Некорректное значение 'Доступное количество' в строке {row_index}: {row_data.get('Доступное количество')}. Установлено 0.")

            try:
                price = float(str(row_data.get('Цена', 0.0)).replace(',', '.') or 0.0)
            except (ValueError, TypeError):
                price = 0.0
                logging.warning(f"Некорректное значение 'Цена' в строке {row_index}: {row_data.get('Цена')}. Установлено 0.0.")

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
        logging.info("Данные успешно синхронизированы из Excel в базу данных.")

    except ValueError as e:
        logging.error(f"Ошибка при синхронизации данных из Excel: {e}")
        session.rollback()
    except Exception as e:
        logging.exception(f"Произошла непредвиденная ошибка при синхронизации Excel:")
        session.rollback()
    finally:
        session.close()

# --- Новая функция для очистки файла заказов Excel ---
def clear_orders_excel():
    """Удаляет существующий файл orders.xlsx, чтобы он создался заново."""
    if os.path.exists(ORDERS_EXCEL_FILE):
        try:
            os.remove(ORDERS_EXCEL_FILE)
            logging.info(f"Существующий файл заказов '{ORDERS_EXCEL_FILE}' удален.")
        except Exception as e:
            logging.error(f"Ошибка при удалении файла заказов '{ORDERS_EXCEL_FILE}': {e}")
    else:
        logging.info(f"Файл заказов '{ORDERS_EXCEL_FILE}' не найден, создавать его не нужно.")


def save_order_to_excel(order_details):
    try:
        if not os.path.exists(ORDERS_EXCEL_FILE):
            workbook = openpyxl.Workbook()
            sheet = workbook.active
            sheet.title = "Заказы"
            sheet.append([
                "Дата и время", 
                "Имя", 
                "Фамилия", 
                "Офис", 
                "Название монеты", 
                "Код монеты", 
                "Количество"
            ])
        else:
            workbook = openpyxl.load_workbook(ORDERS_EXCEL_FILE)
            sheet = workbook["Заказы"]
        
        for item in order_details:
            sheet.append(item)
        
        workbook.save(ORDERS_EXCEL_FILE)
        logging.info(f"Заказ успешно сохранен в файл Excel: {ORDERS_EXCEL_FILE}")
    except Exception as e:
        logging.error(f"Ошибка при сохранении заказа в Excel: {e}")

@app.route('/')
@app.route('/index.html')
def index():
    return render_template('index.html')

@app.route('/cart.html')
def cart():
    return render_template('cart.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/api/coins', methods=['GET'])
def get_coins():
    session = Session()
    try:
        query = session.query(Coin)

        search_query = request.args.get('search', '').lower()
        sort_by = request.args.get('sort_by', 'name')
        sort_order = request.args.get('sort_order', 'asc')
        material_filter = request.args.get('material', '')
        denomination_filter = request.args.get('denomination', '')
        availability_filter = request.args.get('availability', '')

        if search_query:
            query = query.filter(
                (Coin.name.ilike(f'%{search_query}%')) |
                (Coin.number.ilike(f'%{search_query}%'))
            )

        if material_filter:
            query = query.filter(Coin.material == material_filter)

        if denomination_filter:
            query = query.filter(Coin.denomination == denomination_filter)

        if availability_filter:
            if availability_filter == 'in_stock':
                query = query.filter(Coin.available_quantity > 0)
            elif availability_filter == 'out_of_stock':
                query = query.filter(Coin.available_quantity <= 0)

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

        coins = query.all()

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
        logging.error(f"Ошибка при получении монет: {e}")
        return jsonify({'error': 'Ошибка сервера при получении данных'}), 500
    finally:
        session.close()

@app.route('/api/reserve/<string:coin_number>', methods=['POST'])
def reserve_coin(coin_number):
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
        logging.error(f"Ошибка бронирования монеты {coin_number}: {e}")
        return jsonify({'success': False, 'message': f'Ошибка бронирования: {str(e)}'})
    finally:
        session.close()

@app.route('/api/checkout', methods=['POST'])
def checkout():
    data = request.get_json()
    items_to_reserve = data.get('items', [])
    user_first_name = data.get('user_first_name', 'Не указано') 
    user_last_name = data.get('user_last_name', 'Не указано')
    user_office = data.get('user_office', 'Не указано')
    
    session = Session()
    
    results = []
    success_all = True
    
    try:
        for item in items_to_reserve:
            coin_number = item.get('number')
            quantity = item.get('quantity', 1)
            coin = session.query(Coin).filter_by(number=str(coin_number)).first()
            
            if not coin:
                results.append({'number': coin_number, 'success': False, 'message': 'Монета не найдена.'})
                success_all = False
                break
            
            if coin.available_quantity < quantity:
                results.append({
                    'number': coin_number, 
                    'success': False, 
                    'message': f'Недостаточно монет в наличии для "{coin.name}". Доступно: {coin.available_quantity}, Запрошено: {quantity}.'
                })
                success_all = False
                break
        
        if success_all:
            order_records_for_excel = []
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            for item in items_to_reserve:
                coin_number = item.get('number')
                quantity = item.get('quantity', 1)
                coin = session.query(Coin).filter_by(number=str(coin_number)).first()
                if coin:
                    coin.available_quantity -= quantity
                    session.add(coin) 
                    
                    order_records_for_excel.append([
                        current_time,
                        user_first_name,
                        user_last_name,
                        user_office,
                        coin.name,
                        coin.number,
                        quantity
                    ])
            session.commit()
            logging.info(f"Заказ от '{user_first_name} {user_last_name}' успешно зарезервирован в БД.")

            save_order_to_excel(order_records_for_excel)
            
            return jsonify({'success': True, 'message': 'Заказ успешно оформлен!', 'details': results})
        else:
            session.rollback()
            logging.warning("Оформление заказа отменено из-за нехватки монет.")
            return jsonify({'success': False, 'message': 'Не удалось оформить весь заказ. Проверьте детали.', 'details': results})
            
    except Exception as e:
        session.rollback()
        logging.exception(f"Произошла ошибка при оформлении заказа:")
        return jsonify({'success': False, 'message': f'Произошла ошибка при оформлении заказа: {str(e)}', 'details': []})
    finally:
        session.close()

def run_flask_app():
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)

# run_telegram_bot_in_thread и связанные с ним части удалены.

if __name__ == '__main__':
    if platform.system() == "Windows":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    # --- Вызываем новую функцию здесь ---
    clear_orders_excel()
    logging.info("Файл заказов orders.xlsx подготовлен к новой сессии.")
    # ------------------------------------

    init_db()
    sync_excel_to_db()

    flask_thread = threading.Thread(target=run_flask_app, daemon=True)
    flask_thread.start()
    logging.info("Flask-приложение запущено в отдельном потоке на порту 5000...")

    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        logging.info("Приложение остановлено пользователем (Ctrl+C).")
    except Exception as e:
        logging.exception(f"Произошла непредвиденная ошибка в основном потоке:")