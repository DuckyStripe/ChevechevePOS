import React, { useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
const AddCategoryList = () => {
  const [formData, setFormData] = useState({
    valor: "",
    etiqueta: "",
    estatus: true
  });

  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value
    });
  };

  const validateFormData = () => {
    const errors = {};

    if (!formData.valor) {
      errors.valor = "El nombre es requerido.";
    } else if (!/^[a-zA-Z0-9\s]+$/.test(formData.valor)) {
      errors.valor = "El nombre solo puede contener letras y números.";
    }

    if (!formData.etiqueta) {
      errors.etiqueta = "La descripción es requerida.";
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = Cookies.get('authToken');
  
    const formErrors = validateFormData();
    if (Object.keys(formErrors).length === 0) {
      try {
        const config = {
          method: 'post',
          url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Insert/InsertCategoria.php',
          headers: {
            Authorization: `Bearer ${token}`
          },
          data: {
            valor: formData.valor,
            etiqueta: formData.etiqueta,
            estatus: formData.estatus ? 1 : 0
          }
        };
  
        const response = await axios.request(config);
  
        if (response.data.success) {
            toast.success('Categoría creada con éxito');
            window.location.reload();
        } else {
          toast.error('Error al crear la categoría');
        }
      } catch (error) {
        console.error(error);
        toast.error('Hubo un problema al comunicarse con el servidor');
      }
    } else {
      setErrors(formErrors);
    }
  };
  
  return (
    <div>
    <ToastContainer/>
      <div className="modal fade" id="add-category">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Crear Categoria</h4>
                  </div>
                  <button
                    type="button"
                    className="close"
                    data-bs-dismiss="modal"
                    aria-label="Close"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="modal-body custom-modal-body">
                  <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                      <label className="form-label">Categoria</label>
                      <input
                        type="text"
                        className="form-control"
                        name="valor"
                        value={formData.valor}
                        onChange={handleInputChange}
                      />
                      {errors.valor && (
                        <span className="text-danger">{errors.valor}</span>
                      )}
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Descripcion</label>
                      <input
                        type="text"
                        className="form-control"
                        name="etiqueta"
                        value={formData.etiqueta}
                        onChange={handleInputChange}
                      />
                      {errors.etiqueta && (
                        <span className="text-danger">{errors.etiqueta}</span>
                      )}
                    </div>
                    <div className="mb-0">
                      <div className="status-toggle modal-status d-flex justify-content-between align-items-center">
                        <span className="status-label">Estatus</span>
                        <input
                          type="checkbox"
                          id="user2"
                          className="check"
                          name="estatus"
                          checked={formData.estatus}
                          onChange={handleInputChange}
                        />
                        <label htmlFor="user2" className="checktoggle" />
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-submit">
                        Crear
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddCategoryList;
