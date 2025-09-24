import sys
import os
import re
from datetime import datetime
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QVBoxLayout, QHBoxLayout, QPushButton,
    QTextEdit, QLabel, QWidget, QMessageBox, QDialog, QLineEdit, QDialogButtonBox
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont, QIcon
import git

class GitApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.repo_path = "."
        self.repo = git.Repo(self.repo_path)

        self.setWindowTitle("SynUpdate v1.0.1")
        self.setGeometry(300, 300, 400, 300)

        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(20, 20, 20, 20)

        title_label = QLabel("Synedrion Repository Updater")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("font-size: 24px; color: #e0e0e0; font-weight: bold; margin-bottom: 10px;")

        layout.addWidget(title_label)

        self.commit_info = QTextEdit()
        self.commit_info.setReadOnly(True)
        self.commit_info.setFont(QFont("Consolas", 12))
        layout.addWidget(self.commit_info)

        button_layout = QHBoxLayout()

        self.update_btn = QPushButton("ОБНОВИТЬ")
        self.update_btn.clicked.connect(self.update_repo)

        self.push_btn = QPushButton("ОТПРАВИТЬ")
        self.push_btn.clicked.connect(self.push_changes)

        button_layout.addWidget(self.update_btn)
        button_layout.addWidget(self.push_btn)

        layout.addLayout(button_layout)

        self.show_latest_commit()

    def show_latest_commit(self):
        try:
            latest = self.repo.head.commit
            info = f"""
Коммит: {latest.hexsha[:7]}
Автор: {latest.author}
Дата: {latest.committed_datetime.strftime('%Y-%m-%d %H:%M:%S')}
Сообщение: {latest.message.strip()}
            """.strip()
            self.commit_info.setText(info)
        except Exception as e:
            self.commit_info.setText(f"Ошибка: {e}")

    def update_repo(self):
        try:
            if self.repo.is_dirty(untracked_files=True):
                reply = QMessageBox.question(
                    self,
                    "Локальные изменения",
                    "Обнаружены локальные изменения. Всё равно обновить? (ВСЕ ЛОКАЛЬНЫЕ ИЗМИНЕНИЯ БУДУТ УДАЛЕНЫ!)",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
                )
                if reply == QMessageBox.StandardButton.Yes:
                    self.force_pull()
                else:
                    return
            else:
                origin = self.repo.remotes.origin
                origin.pull(rebase=True)
                self.show_latest_commit()
                QMessageBox.information(self, "Успех", "Репозиторий обновлён!")
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Ошибка обновления:\n{e}")

    def force_pull(self):
        try:
            self.repo.git.reset('--hard')
            self.repo.git.clean('-fd')
            origin = self.repo.remotes.origin
            origin.pull(rebase=True)
            self.show_latest_commit()
            QMessageBox.information(self, "Успех", "Репозиторий принудительно обновлён!")
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Ошибка принудительного обновления:\n{e}")

    def push_changes(self):
        dialog = CommitDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            message = dialog.get_message()
            try:
                self.update_version_file(message)
                self.repo.git.add(A=True)  # Добавляем все изменения, включая VERSION.txt
                self.repo.index.commit(message)
                origin = self.repo.remotes.origin
                origin.push()
                self.show_latest_commit()
                QMessageBox.information(self, "Успех", "Изменения выложены!")
            except Exception as e:
                QMessageBox.critical(self, "Ошибка", f"Ошибка отправки:\n{e}")

    def update_version_file(self, message):
        version_file = "VERSION.txt"
        if not os.path.exists(version_file):
            return

        with open(version_file, "r", encoding="utf-8") as f:
            content = f.read().strip()

        match = re.match(r"(\d+\.\d+\.\d+)\s+build\s+(\d{2}/\d{2}/\d{2})", content)
        if not match:
            return

        current_version = match.group(1)
        new_version_match = re.match(r"(\d+\.\d+\.\d+)", message)
        if new_version_match:
            current_version = new_version_match.group(1)

        today = datetime.now().strftime("%y/%m/%d")

        new_content = f"{current_version} build {today}"
        with open(version_file, "w", encoding="utf-8") as f:
            f.write(new_content)


class CommitDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Описание изменений")
        self.resize(500, 150)

        layout = QVBoxLayout(self)

        self.text_input = QLineEdit()
        self.text_input.setPlaceholderText("Введите краткое описание изменений...")
        self.text_input.setFont(QFont("Arial", 12))

        button_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)

        layout.addWidget(self.text_input)
        layout.addWidget(button_box)

    def get_message(self):
        return self.text_input.text()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setWindowIcon(QIcon("logo.ico"))
    window = GitApp()
    window.setStyleSheet("""
        QMainWindow {
            background-color: #1e2a38;
        }
        QPushButton {
            background-color: #2a6f97;
            color: white;
            border-radius: 6px;
            padding: 10px;
            font-size: 14px;
            font-weight: bold;
        }
        QPushButton:hover {
            background-color: #3a8fb7;
        }
        QTextEdit {
            background-color: #2d3a4a;
            color: #e0e0e0;
            border: 1px solid #3a4a5a;
            border-radius: 6px;
            padding: 10px;
            font-size: 13px;
        }
        QLabel {
            color: #e0e0e0;
        }
    """)
    window.show()
    sys.exit(app.exec())