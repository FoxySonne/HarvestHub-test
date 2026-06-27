<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HarvestHub</title>

<style>
:root {
    --bg: #0f1115;
    --panel: #151922;
    --card: #1a1f2a;
    --text: #e6e6e6;
    --button: #3a7a3a;
    --lightgreen: #8BEA63;
}

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: Arial, sans-serif;
}

/* ===== TOPBAR (mobile) ===== */
.topbar {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 16px 20px;
    background: var(--panel);
    position: sticky;
    top: 0;
    z-index: 100;
}

.menu-button {
    font-size: 28px;
    cursor: pointer;
}

.topbar-title {
    font-size: 20px;
    font-weight: bold;
}

/* ===== SIDEBAR ===== */
#menu-toggle {
    display: none;
}

.left {
    position: fixed;
    top: 0;
    left: -260px;
    width: 240px;
    height: 100vh;
    background: var(--panel);
    padding: 20px;
    transition: 0.3s;
    z-index: 999;
}

#menu-toggle:checked ~ .left {
    left: 0;
}

/* overlay */
.overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: none;
}

#menu-toggle:checked ~ .overlay {
    display: block;
}

/* MENU */
.logo {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 10px;
}

.menu-item {
    padding: 12px 0;
    border-bottom: 1px solid #2b3140;
}

/* ===== MAIN ===== */
.container {
    display: block;
}

.main {
    padding: 20px;
}

.hero {
    background: var(--card);
    padding: 24px;
    border-radius: 14px;
    text-align: center;
}

.lightgreen {
    color: var(--lightgreen);
}

.buttons {
    margin-top: 20px;
}

.button {
    display: inline-block;
    padding: 10px 14px;
    margin: 5px;
    background: var(--button);
    border-radius: 8px;
}

/* MOBILE right blocks */
.right {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 24px;
}

.box {
    background: var(--card);
    border-radius: 12px;
    padding: 14px;
}

/* ===== DESKTOP ===== */
@media (min-width: 900px) {

    .topbar {
        display: none;
    }

    .container {
        display: grid;
        grid-template-columns: 220px 1fr 260px;
        height: 100vh;
    }

    .left {
        position: static;
        width: auto;
        height: auto;
    }

    .overlay {
        display: none !important;
    }

    .main {
        padding: 40px;
    }

    .right {
        display: block;
        margin-top: 0;
    }

    .box {
        margin-bottom: 20px;
    }

}
</style>
</head>

<body>

<input type="checkbox" id="menu-toggle">

<!-- MOBILE TOPBAR -->
<div class="topbar">
    <label for="menu-toggle" class="menu-button">☰</label>
    <div class="topbar-title">HarvestHub</div>
</div>

<label for="menu-toggle" class="overlay"></label>

<div class="container">

    <!-- LEFT -->
    <div class="left">
        <div class="logo">HarvestHub</div>
        <div>Dig. Grow. Survive.</div>

        <br>

        <div class="menu-item">Главная</div>
        <div class="menu-item">База знаний</div>
        <div class="menu-item">Калькулятор</div>
        <div class="menu-item">Ивенты</div>
        <div class="menu-item">Список дел</div>
        <div class="menu-item">События</div>
        <div class="menu-item">Полезные советы</div>
        <div class="menu-item">Настройки</div>
    </div>

    <!-- MAIN -->
    <div class="main">

        <div class="hero">
            <h1>Stop fighting.</h1>
            <h1><span class="lightgreen">Start farming.</span></h1>

            <p>Ваш лучший помощник для Tiles Survive</p>

            <div class="buttons">
                <div class="button">База знаний</div>
                <div class="button">Калькулятор</div>
            </div>
        </div>

        <h3>Популярные гайды</h3>
        <h3>Последние обновления</h3>

    </div>

    <!-- RIGHT -->
    <div class="right">

        <div class="box">
            <h4>Быстрые ссылки</h4>
            <p>Расписание</p>
            <p>Герои</p>
            <p>Стоимость построек</p>
        </div>

        <div class="box">
            <h4>Совет дня</h4>
            <p>Бей крокодила!</p>
        </div>

    </div>

</div>

</body>
</html>
