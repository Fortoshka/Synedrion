"""Модуль для обработки файлов, прикрепленных к запросам ИИ"""

import os
import base64
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FileHandler:
    """Класс для обработки прикрепленных файлов"""
    
    SUPPORTED_IMAGE_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    SUPPORTED_TEXT_FORMATS = {'.txt'}  # Пока поддерживаем только .txt
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
    
    @staticmethod
    def validate_file(file_path: str) -> dict:
        """Проверяет файл на существование и доступность"""
        if not os.path.exists(file_path):
            return {"success": False, "error": "Файл не найден"}
        
        if not os.path.isfile(file_path):
            return {"success": False, "error": "Путь не является файлом"}
        
        file_size = os.path.getsize(file_path)
        if file_size > FileHandler.MAX_FILE_SIZE:
            return {"success": False, "error": f"Файл слишком большой (макс. 10 МБ)"}
        
        return {"success": True, "size": file_size}
    
    @staticmethod
    def process_image(file_path: str) -> dict:
        """Обрабатывает изображение и возвращает base64"""
        logger.info(f"Обработка изображения: {file_path}")
        
        validation = FileHandler.validate_file(file_path)
        if not validation["success"]:
            return validation
        
        ext = Path(file_path).suffix.lower()
        if ext not in FileHandler.SUPPORTED_IMAGE_FORMATS:
            return {"success": False, "error": f"Неподдерживаемый формат: {ext}"}
        
        try:
            with open(file_path, 'rb') as f:
                image_data = f.read()
                base64_data = base64.b64encode(image_data).decode('utf-8')
            
            return {
                "success": True,
                "type": "image",
                "format": ext[1:],
                "size": len(image_data),
                "data": base64_data,
                "filename": os.path.basename(file_path)
            }
        except Exception as e:
            logger.error(f"Ошибка чтения изображения: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def process_text_file(file_path: str) -> dict:
        """Обрабатывает текстовый файл и возвращает его содержимое"""
        logger.info(f"Обработка текстового файла: {file_path}")
        
        validation = FileHandler.validate_file(file_path)
        if not validation["success"]:
            return validation
        
        ext = Path(file_path).suffix.lower()
        
        # Если расширение пустое или не .txt, возвращаем ошибку с информативным сообщением
        if not ext:
            return {"success": False, "error": "Файл не имеет расширения. Поддерживаются только .txt файлы"}
        
        if ext not in FileHandler.SUPPORTED_TEXT_FORMATS:
            return {"success": False, "error": f"Неподдерживаемый формат: {ext}. Поддерживаются только .txt файлы"}
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return {
                "success": True,
                "type": "text",
                "format": ext[1:] if ext else "txt",
                "size": len(content),
                "content": content,
                "filename": os.path.basename(file_path)
            }
        except UnicodeDecodeError:
            try:
                with open(file_path, 'r', encoding='cp1251') as f:
                    content = f.read()
                return {
                    "success": True,
                    "type": "text",
                    "format": ext[1:] if ext else "txt",
                    "size": len(content),
                    "content": content,
                    "filename": os.path.basename(file_path)
                }
            except Exception as e:
                logger.error(f"Ошибка чтения файла: {e}")
                return {"success": False, "error": "Не удалось прочитать файл"}
        except Exception as e:
            logger.error(f"Ошибка чтения файла: {e}")
            return {"success": False, "error": str(e)}
