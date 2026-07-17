// パパごはんアルバムのデータは、この端末のIndexedDBだけに保存します。
const DB_NAME = "papa-gohan-album";
const DB_VERSION = 1;
const STORE_NAME = "meals";
const PHOTO_MAX_SIZE = 1200;
const PHOTO_QUALITY = 0.76;

const els = {
  openFormButton: document.querySelector("#openFormButton"),
  pickMealButton: document.querySelector("#pickMealButton"),
  recordTab: document.querySelector("#recordTab"),
  randomTab: document.querySelector("#randomTab"),
  recordPanel: document.querySelector("#recordPanel"),
  randomPanel: document.querySelector("#randomPanel"),
  searchInput: document.querySelector("#searchInput"),
  mealList: document.querySelector("#mealList"),
  randomArea: document.querySelector("#randomArea"),
  mealDialog: document.querySelector("#mealDialog"),
  mealForm: document.querySelector("#mealForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  mealId: document.querySelector("#mealId"),
  photoCameraInput: document.querySelector("#photoCameraInput"),
  photoAlbumInput: document.querySelector("#photoAlbumInput"),
  photoPreview: document.querySelector("#photoPreview"),
  photoHint: document.querySelector("#photoHint"),
  nameInput: document.querySelector("#nameInput"),
  ingredientsInput: document.querySelector("#ingredientsInput"),
  dateInput: document.querySelector("#dateInput"),
  saveButton: document.querySelector("#saveButton"),
  photoDialog: document.querySelector("#photoDialog"),
  closePhotoButton: document.querySelector("#closePhotoButton"),
  largePhoto: document.querySelector("#largePhoto"),
  detailDialog: document.querySelector("#detailDialog"),
  closeDetailButton: document.querySelector("#closeDetailButton"),
  detailName: document.querySelector("#detailName"),
  detailPhotoFrame: document.querySelector("#detailPhotoFrame"),
  detailPhoto: document.querySelector("#detailPhoto"),
  detailPhotoPlaceholder: document.querySelector("#detailPhotoPlaceholder"),
  detailDate: document.querySelector("#detailDate"),
  detailIngredients: document.querySelector("#detailIngredients"),
  editFromDetailButton: document.querySelector("#editFromDetailButton")
};

let db;
let meals = [];
let editingPhotoBlob = null;
let selectedPhotoBlob = null;
let lastRandomMealId = null;
let objectUrls = [];
let detailPhotoUrl = null;

document.addEventListener("DOMContentLoaded", async () => {
  setToday();
  bindEvents();
  await initDb();
  await loadMeals();
  renderMeals();
  registerServiceWorker();
});

function bindEvents() {
  els.openFormButton.addEventListener("click", () => openMealForm());
  els.pickMealButton.addEventListener("click", () => {
    showTab("random");
    pickRandomMeal();
  });
  els.recordTab.addEventListener("click", () => showTab("record"));
  els.randomTab.addEventListener("click", () => showTab("random"));
  els.searchInput.addEventListener("input", renderMeals);
  els.closeDialogButton.addEventListener("click", () => els.mealDialog.close());
  els.closePhotoButton.addEventListener("click", () => els.photoDialog.close());
  els.closeDetailButton.addEventListener("click", () => closeDetailDialog());
  els.detailDialog.addEventListener("close", clearDetailPhotoUrl);
  els.editFromDetailButton.addEventListener("click", () => {
    const id = Number(els.editFromDetailButton.dataset.editId);
    closeDetailDialog();
    editMeal(id);
  });
  els.photoCameraInput.addEventListener("change", handlePhotoChange);
  els.photoAlbumInput.addEventListener("change", handlePhotoChange);
  els.mealForm.addEventListener("submit", saveMeal);
}

function initDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true
        });
        store.createIndex("date", "date");
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

function transaction(mode = "readonly") {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function getAllMeals() {
  return new Promise((resolve, reject) => {
    const request = transaction().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function putMeal(meal) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").put(meal);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteMeal(id) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadMeals() {
  meals = await getAllMeals();
  meals.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    return dateCompare || b.id - a.id;
  });
}

function renderMeals() {
  clearObjectUrls();
  const keyword = els.searchInput.value.trim().toLowerCase();
  const filteredMeals = meals.filter((meal) => {
    const text = `${meal.name} ${meal.ingredients || ""}`.toLowerCase();
    return text.includes(keyword);
  });

  if (!filteredMeals.length) {
    els.mealList.innerHTML = keyword
      ? '<p class="soft-message">見つかりませんでした。別の言葉で探してみてください。</p>'
      : '<p class="soft-message">まだごはんの記録がありません。最初の一皿を残してみましょう。</p>';
    return;
  }

  els.mealList.innerHTML = filteredMeals.map((meal) => mealCardHtml(meal)).join("");
  filteredMeals.forEach((meal) => setCardPhoto(meal));

  document.querySelectorAll(".meal-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-edit-id], [data-delete-id]")) return;
      openMealDetail(Number(card.dataset.detailId));
    });
    card.addEventListener("keydown", (event) => {
      if (event.target !== card) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openMealDetail(Number(card.dataset.detailId));
    });
  });

  document.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => editMeal(Number(button.dataset.editId)));
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => confirmDeleteMeal(Number(button.dataset.deleteId)));
  });

}

function mealCardHtml(meal) {
  return `
    <article class="meal-card" data-detail-id="${meal.id}" tabindex="0">
      <button class="meal-photo-button" type="button" data-photo-id="${meal.id}" aria-label="${escapeHtml(meal.name)}の詳細を見る">
        <div class="meal-photo-placeholder" id="photo-${meal.id}">写真</div>
      </button>
      <div class="meal-body">
        <div class="meal-title-row">
          <h2 class="meal-title">${escapeHtml(meal.name)}</h2>
          <time class="meal-date" datetime="${meal.date}">${formatDate(meal.date)}</time>
        </div>
        <p class="meal-ingredients">${escapeHtml(meal.ingredients || "材料メモなし")}</p>
        <div class="card-actions">
          <button class="edit-button" type="button" data-edit-id="${meal.id}">編集</button>
          <button class="delete-button" type="button" data-delete-id="${meal.id}">削除</button>
        </div>
      </div>
    </article>
  `;
}

function setCardPhoto(meal) {
  const frame = document.querySelector(`#photo-${meal.id}`);
  if (!frame || !meal.photoBlob) return;

  const url = URL.createObjectURL(meal.photoBlob);
  objectUrls.push(url);
  frame.outerHTML = `<img class="meal-photo" src="${url}" alt="${escapeHtml(meal.name)}">`;
}

function openMealForm(meal = null) {
  els.mealForm.reset();
  els.photoPreview.classList.remove("has-photo");
  els.photoPreview.removeAttribute("src");
  els.photoHint.textContent = "写真を選ぶとここに表示されます";
  selectedPhotoBlob = null;
  editingPhotoBlob = null;

  if (meal) {
    els.dialogTitle.textContent = "ごはんを編集";
    els.mealId.value = meal.id;
    els.nameInput.value = meal.name;
    els.ingredientsInput.value = meal.ingredients || "";
    els.dateInput.value = meal.date;
    editingPhotoBlob = meal.photoBlob || null;
    if (meal.photoBlob) {
      const url = URL.createObjectURL(meal.photoBlob);
      els.photoPreview.src = url;
      els.photoPreview.classList.add("has-photo");
      els.photoHint.textContent = "写真を変更できます";
      els.photoPreview.onload = () => URL.revokeObjectURL(url);
    }
  } else {
    els.dialogTitle.textContent = "今日のごはん";
    els.mealId.value = "";
    setToday();
  }

  els.mealDialog.showModal();
  setTimeout(() => els.nameInput.focus(), 120);
}

function editMeal(id) {
  const meal = meals.find((item) => item.id === id);
  if (meal) openMealForm(meal);
}

async function confirmDeleteMeal(id) {
  const meal = meals.find((item) => item.id === id);
  if (!meal) return;

  const ok = window.confirm(`「${meal.name}」を削除しますか？`);
  if (!ok) return;

  await deleteMeal(id);
  await loadMeals();
  renderMeals();
  if (lastRandomMealId === id) {
    lastRandomMealId = null;
    renderRandomEmpty();
  }
}

async function handlePhotoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    // 撮影でもアルバム選択でも、同じ縮小処理を通してから保存候補にします。
    selectedPhotoBlob = await resizePhoto(file);
    const url = URL.createObjectURL(selectedPhotoBlob);
    els.photoPreview.src = url;
    els.photoPreview.classList.add("has-photo");
    els.photoHint.textContent = "写真を変更できます";
    els.photoPreview.onload = () => URL.revokeObjectURL(url);
    event.target.value = "";
  } catch (error) {
    alert("写真を読み込めませんでした。別の写真を選んでください。");
  }
}

async function saveMeal(event) {
  event.preventDefault();
  const name = els.nameInput.value.trim();
  if (!name) {
    els.nameInput.focus();
    return;
  }

  const existingId = els.mealId.value ? Number(els.mealId.value) : null;
  const oldMeal = existingId ? meals.find((meal) => meal.id === existingId) : null;
  const meal = {
    name,
    ingredients: els.ingredientsInput.value.trim(),
    date: els.dateInput.value,
    photoBlob: selectedPhotoBlob || editingPhotoBlob || oldMeal?.photoBlob || null,
    updatedAt: new Date().toISOString()
  };

  // 新規登録ではIndexedDBにIDを自動で付けてもらい、編集時だけ元のIDを使います。
  if (existingId) meal.id = existingId;

  try {
    await putMeal(meal);
    els.mealDialog.close();
    await loadMeals();
    renderMeals();
  } catch (error) {
    alert("保存できませんでした。少し時間を置いてもう一度お試しください。");
  }
}

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, width, height);

      // JPEGに変換して、スマートフォン内に保存しやすい容量へ小さくします。
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("画像の変換に失敗しました"));
      }, "image/jpeg", PHOTO_QUALITY);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めません"));
    };

    image.src = url;
  });
}

function pickRandomMeal() {
  if (!meals.length) {
    els.randomArea.innerHTML = '<p class="soft-message">先に「今日のごはんを記録」から料理を登録してください。</p>';
    return;
  }

  let candidates = meals;
  if (meals.length > 1 && lastRandomMealId) {
    candidates = meals.filter((meal) => meal.id !== lastRandomMealId);
  }

  const meal = candidates[Math.floor(Math.random() * candidates.length)];
  lastRandomMealId = meal.id;
  renderRandomMeal(meal);
}

function renderRandomMeal(meal) {
  const photoHtml = meal.photoBlob
    ? `<img id="randomPhoto" alt="${escapeHtml(meal.name)}">`
    : '<div class="random-photo-placeholder">写真</div>';

  els.randomArea.innerHTML = `
    <article class="random-card">
      ${photoHtml}
      <div class="random-body">
        <h2>${escapeHtml(meal.name)}</h2>
        <p>${escapeHtml(meal.ingredients || "材料メモなし")}</p>
        <button class="again-button" id="againButton" type="button">もう一回</button>
      </div>
    </article>
  `;

  if (meal.photoBlob) {
    const url = URL.createObjectURL(meal.photoBlob);
    const photo = document.querySelector("#randomPhoto");
    photo.src = url;
    photo.onload = () => URL.revokeObjectURL(url);
  }

  document.querySelector("#againButton").addEventListener("click", pickRandomMeal);
}

function renderRandomEmpty() {
  els.randomArea.innerHTML = '<p class="soft-message">「今日なに食べたい？」を押すと、今までのごはんから1品えらびます。</p>';
}

function openLargePhoto(id) {
  const meal = meals.find((item) => item.id === id);
  if (!meal?.photoBlob) return;

  const url = URL.createObjectURL(meal.photoBlob);
  els.largePhoto.src = url;
  els.largePhoto.alt = meal.name;
  els.photoDialog.showModal();
  els.largePhoto.onload = () => URL.revokeObjectURL(url);
}

function openMealDetail(id) {
  const meal = meals.find((item) => item.id === id);
  if (!meal) return;

  clearDetailPhotoUrl();
  els.detailName.textContent = meal.name;
  els.detailDate.textContent = formatFullDate(meal.date);
  els.detailDate.dateTime = meal.date;
  els.detailIngredients.textContent = meal.ingredients || "材料メモなし";
  els.editFromDetailButton.dataset.editId = String(meal.id);
  els.detailPhoto.alt = meal.name;
  els.detailPhoto.removeAttribute("src");
  els.detailPhotoFrame.classList.remove("has-photo");

  if (meal.photoBlob) {
    detailPhotoUrl = URL.createObjectURL(meal.photoBlob);
    els.detailPhoto.src = detailPhotoUrl;
    els.detailPhotoFrame.classList.add("has-photo");
  }

  els.detailDialog.showModal();
}

function closeDetailDialog() {
  if (els.detailDialog.open) els.detailDialog.close();
}

function clearDetailPhotoUrl() {
  if (!detailPhotoUrl) return;
  URL.revokeObjectURL(detailPhotoUrl);
  detailPhotoUrl = null;
}

function showTab(tabName) {
  const isRecord = tabName === "record";
  els.recordPanel.classList.toggle("is-active", isRecord);
  els.randomPanel.classList.toggle("is-active", !isRecord);
  els.recordTab.classList.toggle("is-active", isRecord);
  els.randomTab.classList.toggle("is-active", !isRecord);
  els.recordTab.setAttribute("aria-selected", String(isRecord));
  els.randomTab.setAttribute("aria-selected", String(!isRecord));
}

function setToday() {
  els.dateInput.value = getLocalDateValue();
}

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatFullDate(value) {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
