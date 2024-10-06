// products.js
export const lowstock = [
  {
    key: "1",
    category: "Electronics",
    categoryslug: "electronics",
    createdon: "2024-01-12",
    status: "Active"
  }
];
const category = [
  { value: "Elegir", label: "Elegir" },
  { value: "Modelo", label: "Modelo" },
  { value: "Corona", label: "Corona" }
];
const subcategory = [
  { value: "Elegir", label: "Elegir" },
  { value: "Cuarto", label: "Cuarto" },
  { value: "Media", label: "Media" },
  { value: "Mega", label: "Mega" }
];
const unidad = [
  { value: "0", label: "Elije uno" },
  { value: "Unidad", label: "Unidad/Pieza" },
  { value: "Paquete", label: "Paquete" }
];
export const fetchCategory = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return lowstock;
};

export const fetchCategories = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return category;
};
export const fetchSubCategories = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return subcategory;
};
export const fetchUnidad = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return unidad;
};