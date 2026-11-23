// pos.js
import axios from 'axios';
import Cookies from 'js-cookie';

// Configurar la URL base de tu API
const baseURL = 'https://cheveposapi.codelabs.com.mx/Endpoints'; // Cambia esto por la URL de tu API

const apiClient = axios.create({
  baseURL: baseURL,
  headers: {
    'Authorization': `Bearer ${Cookies.get('authToken')}`,
    'Content-Type': 'application/json'
  }
});

export const fetchCustomerData = async () => {
  try {
    const response = await apiClient.get('/Gets/getPOSData.php');
    if (response.data.success) {
      return response.data.Data.Clientes;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    console.error('Error fetching customer data:', error.message);
    return [];
  }
};

export const fetchCategoriesData = async () => {
  try {
    const response = await apiClient.get('/Gets/getPOSData.php');
    if (response.data.success) {
      return response.data.Data.categories;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    console.error('Error fetching categories data:', error.message);
    return [];
  }
};

export const fetchProductsData = async () => {
  try {
    const response = await apiClient.get('/Gets/getPOSData.php');
    if (response.data.success) {
      return response.data.Data.products;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    console.error('Error fetching products data:', error.message);
    return [];
  }
};

export const fetchLastPurchaseData = async () => {
  try {
    const response = await apiClient.get('/Gets/getPOSData.php');
    if (response.data.success) {
      return response.data.Data.Lastpurchase;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    console.error('Error fetching last purchase data:', error.message);
    return null;
  }
};

export const fetchProductsByCategory = async (categoryId) => {
  try {
    const response = await apiClient.get('/Gets/getPOSData.php');
    if (response.data.success) {
      return response.data.Data.products.filter(product => product.categoryId === categoryId);
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    console.error('Error fetching products by category:', error.message);
    return [];
  }
};

export const fetchRecentOrders = async () => {
  try {
    const response = await apiClient.get('/Gets/getPOSData.php');
    if (response.data.success) {
      return response.data.Data.Last5Orders;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    console.error('Error fetching recent orders:', error.message);
    return [];
  }
};
