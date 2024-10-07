import { fakerES } from '@faker-js/faker';

// Generación de clientes
const Clientes = Array.from({ length: 5 }, () => ({
  id: fakerES.number.int({ min: 10, max: 100 }),
  label: fakerES.person.firstName()
}));
const Lastpurchase = {
  id: fakerES.number.int({ min: 10, max: 10000 }),
};
const Last5Orders =Array.from({ length: 10 }, () => ({
  id: fakerES.number.int({ min: 10, max: 100 }),
  Vendedor: fakerES.name.firstName(),
  Cliente: fakerES.name.firstName(),
  Total:parseFloat(fakerES.commerce.price()),
  Fecha: fakerES.date.past(),
}));

// Generación de productos
const products = Array.from({ length: 5 }, () => ({
  id: fakerES.number.int({ min: 10, max: 100 }),
  label: fakerES.name.firstName(),
}));

// Generación de categorías
const categories = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1, // IDs secuenciales para tener 1-6
  image: fakerES.image.url({
    width: 200,
    height: 200,
  }),
  title: fakerES.commerce.department(),
  items: fakerES.number.int({ min: 10, max: 100 }),
}));

// Generación de productos
const productos = Array.from({ length: 20 }, () => {
  const precio = parseFloat(fakerES.commerce.price());
  const categoryId = fakerES.number.int({ min: 1, max: 6 }); // IDs de categorías de 1 a 6

  return {
    id: fakerES.number.int({ min: 10, max: 100 }),
    image: fakerES.image.url({
      width: 200,
      height: 200,
    }),
    categoryId, // Relaciona el producto con una categoría
    ProductName: fakerES.commerce.productName(),
    Disponibilidad: fakerES.number.int({ min: 10, max: 100 }),
    precio,
    cantidad: 1,
    total: precio,
  };
});

// Asegúrate que cada categoría tenga al menos un producto
const ensureProductsForCategories = () => {
  categories.forEach(category => {
    // Asegúrate de que hay al menos un producto por categoría
    if (!productos.some(product => product.categoryId === category.id)) {
      const newProduct = {
        id: fakerES.number.int({ min: 10, max: 100 }),
        image: fakerES.image.url({ width: 200, height: 200 }),
        categoryId: category.id, // Asegura que este product pertenece a la categoría
        ProductName: fakerES.commerce.productName(),
        Disponibilidad: fakerES.number.int({ min: 10, max: 100 }),
        precio: parseFloat(fakerES.commerce.price()),
        cantidad: 1,
        total: parseFloat(fakerES.commerce.price()), // Inicialmente igual al precio
      };
      productos.push(newProduct); // Agrega el nuevo producto a la lista
    }
  });
};

// Llama a la función para asegurarte que cada categoría tiene al menos un producto
ensureProductsForCategories();

export const fetchCustomerData = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simula un retraso de 500ms
  return Clientes;
};

export const fetchProductData = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simula un retraso de 500ms
  return products;
};

export const fetchCategoriesData = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simula un retraso de 500ms
  return categories;
};

export const fetchProductsData = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simula un retraso de 500ms
  return productos;
};
export const fetchLastPurchaseData = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simula un retraso de 500ms
  return Lastpurchase;
};

export const fetchProductsByCategory = async (categoryId) => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simula un retraso

  return productos.filter(product => product.categoryId === categoryId);
};
export const fetchRecentOrders = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simula un retraso

  return Last5Orders
};