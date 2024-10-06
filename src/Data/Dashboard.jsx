
const mockProductData = [
  {
    id: 1,
    productName: "Media Corona",
    quantity: 100,
    lastPurchase: "17 Enero 2024",
    image: "assets/img/Cheve/mediaCorona.jpeg"
  }
];
const mockRecentPurchasesData = [
  {
    id: 1,
    productName: "Media Corona",
    quantity: 100,
    price: 8200, // Precio asignado arbitrariamente
    image: "assets/img/Cheve/mediaCorona.jpeg"
  }
];
const mockDashboardata = {
  TotalProducto: 307144,
  TotalDinero: 60500,
  TotalEgresos: 150000,
  TotalVentas: 504611,
  Clientes:100,
  Pedidos:120,
  PedidosModelo:10,
  Externos:15
};

// Mockup de una respuesta de API para los datos del gráfico
const mockProfits = {
  years: [2021,2022, 2023, 2024],
  data: {
    2021: {
      sales: [130, 240, 350, 290, 170, 80, 230, 320, 120],
      purchases: [-130, -90, -50, -180, -50, -70, -100, -90, -100],
    },
    2022: {
      sales: [13, 240, 350, 290, 170, 80, 230, 320, 120],
      purchases: [-130, -90, -50, -180, -50, -70, -100, -90, -100],
    },
    2023: {
      sales: [140, 220, 310, 300, 160, 70, 220, 290, 115],
      purchases: [-140, -80, -40, -170, -40, -60, -90, -80, -95],
    },
    2024: {
      sales: [100, 230, 320, 310, 170, 80, 240, 300, 125],
      purchases: [-150, -70, -30, -160, -30, -50, -80, -70, -85],
    }

  },
  categories: [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
  ],
};




// PRODUCTOS
export const fetchProducts = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockProductData;
};

export const fetchRecentPurchaseProducts = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockRecentPurchasesData;
};

export const fetchDashboardData = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockDashboardata;
};
export const fetchDataProfit = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log("prefuncion",mockProfits)
  return mockProfits;
};