const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const openButton = document.getElementById("openMenu");

// Открыть меню
function openMenu() {

    sidebar.classList.add("active");
    overlay.classList.add("active");

}

// Закрыть меню
function closeMenu() {

    sidebar.classList.remove("active");
    overlay.classList.remove("active");

}

// Кнопка меню
if (openButton) {

    openButton.addEventListener("click", openMenu);

}

// Клик по затемнению
if (overlay) {

    overlay.addEventListener("click", closeMenu);

}

// Клавиша Esc
document.addEventListener("keydown", function(event){

    if(event.key === "Escape"){

        closeMenu();

    }

});
