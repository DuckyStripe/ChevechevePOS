import React, { useState, useEffect } from "react";
import Select from "react-select";
import axios from "axios";
import Cookies from "js-cookie";
import { fetchCategories } from "../../../Data/Inventario/category";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css"; // Asegúrate de importar los estilos del toast

const AddSubcategory = () => {
  const [category, setCategory] = useState([]);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    valor: "",
    etiqueta: "",
    estatus: true,
    CategoriaPadre: null
  });

  useEffect(() => {
    const loadInitialData = async () => {
      const categoryData = await fetchCategories();
      setCategory(categoryData);
    };
    loadInitialData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value
    });
  };

  const handleSelectChange = (selectedOption) => {
    setFormData({
      ...formData,
      CategoriaPadre: selectedOption ? selectedOption.value : null
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
    if (!formData.CategoriaPadre) {
      errors.CategoriaPadre = "La categoría padre es requerida.";
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = Cookies.get("authToken");

    const formErrors = validateFormData();
    if (Object.keys(formErrors).length === 0) {
      try {
        const config = {
          method: "post",
          url: "https://cheveposapi.codelabs.com.mx/Endpoints/Insert/InsertarSubcategoria.php", // Cambia la URL según sea necesario
          headers: {
            Authorization: `Bearer ${token}`
          },
          data: {
            valor: formData.valor,
            etiqueta: formData.etiqueta,
            categoria_id: formData.CategoriaPadre,
            estatus: formData.estatus ? 1 : 0
          }
        };

        const response = await axios.request(config);

        if (response.data.success) {
          toast.success("Subcategoría creada con éxito");
          window.location.reload();
        } else {
          toast.error("Error al crear la subcategoría");
        }
      } catch (error) {
        console.error(error);
        toast.error("Hubo un problema al comunicarse con el servidor");
      }
    } else {
      setErrors(formErrors);
    }
  };
  const resetform = async () => {
    setFormData({
      valor: "",
      etiqueta: "",
      estatus: true,
      CategoriaPadre: null
    });
  };

  return (
    <div>
      <div className="modal fade" id="add-category">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Crear SubCategoria</h4>
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
                      <label className="form-label">Categoria Padre</label>
                      <Select
                        classNamePrefix="react-select"
                        options={category} // Usar directamente si ya está correctamente formateado
                        value={
                          category.find(
                            (cat) => cat.value === formData.CategoriaPadre
                          ) || null
                        } // Asegurarse de que pueda ser null
                        onChange={handleSelectChange}
                      />
                      {errors.CategoriaPadre && (
                        <span className="text-danger">
                          {errors.CategoriaPadre}
                        </span>
                      )}
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Nombre Subcategoria</label>
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
                    <div className="mb-3 input-blocks">
                      <label className="form-label">Descripcion</label>
                      <textarea
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
                        <span className="status-label">Status</span>
                        <input
                          type="checkbox"
                          id="estatus"
                          className="check"
                          name="estatus"
                          checked={formData.estatus}
                          onChange={handleInputChange}
                        />
                        <label htmlFor="estatus" className="checktoggle" />
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                        onClick={resetform}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-submit">
                        Guardar
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

export default AddSubcategory;
