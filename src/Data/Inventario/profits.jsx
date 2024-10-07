import axios from 'axios';
import Cookies from 'js-cookie';

export const availableMonths = [
    { value: "Selecciona uno", label: "Selecciona uno" },
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" }, // Mes de agosto
    { value: 9, label: "Septiembre" }, // Mes de septiembre
    { value: 10, label: "Octubre" }, // Mes de octubre
    { value: 11, label: "Noviembre" }, // Mes de noviembre
    { value: 12, label: "Diciembre" }  // Mes de diciembre
];


// Funciones simuladas para recuperar datos
export const fetchProfitsYear = async (year) => {
    const token = Cookies.get('authToken');
    const formData = new FormData();
    formData.append("Year", year);
  
    // Configuración de solicitud con método POST
    const config = {
      method: 'post',
      url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getProfitsByYear.php',
      headers: {
        'Authorization': `Bearer ${token}`,
        // No establezcas 'Content-Type', Axios lo manejará automáticamente
      },
      data: formData // Usa 'data' para enviar el formData
    };
  
    try {
      const response = await axios.request(config);
  
      if (response.data.success) {
        const data = response.data.Data;
    
        return data;
      } else {
        return { success: false, message: response.data.message };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
};

export const fetchProfitsMonths = async (year,month) => {
    const token = Cookies.get('authToken');
    const formData = new FormData();
    formData.append("Year", year);
    formData.append("Mounth", month);
    // Configuración de solicitud con método POST
    const config = {
      method: 'post',
      url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getProfitsMounthYear.php',
      headers: {
        'Authorization': `Bearer ${token}`,
        // No establezcas 'Content-Type', Axios lo manejará automáticamente
      },
      data: formData // Usa 'data' para enviar el formData
    };
  
    try {
      const response = await axios.request(config);
  
      if (response.data.success) {
        const data = response.data.Data;
    
        return data;
      } else {
        return { success: false, message: response.data.message };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
};

export const fetchProfitsYears = async () => {
    const token = Cookies.get('authToken');
    // Configuración de solicitud con método POST
    const config = {
      method: 'get',
      url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getAvaibleYears.php',
      headers: {
        'Authorization': `Bearer ${token}`,
        // No establezcas 'Content-Type', Axios lo manejará automáticamente
      }
    };
  
    try {
      const response = await axios.request(config);
  
      if (response.data.success) {
        const data = response.data.Data;
    
        return data;
      } else {
        return { success: false, message: response.data.message };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
};

export const fetchProfitsMonthsAvailable = async () => {
    return availableMonths;
};
