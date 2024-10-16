import React, { useState, useRef } from "react";
import {  toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";
import Cookies from "js-cookie";


const AddRole = () => {
  const [formData, setFormData] = useState({
    role: ""
  });
  const [formErrors, setFormErrors] = useState({});
  const modalRef = useRef(null);
  const resetFormData = () => {
    setFormData({
      role: ""
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.role) {
      errors.role = "El rol es obligatorio";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = Cookies.get("authToken");
    if (validateForm()) {
      try {
        const config = {
          method: "post",
          url: `https://cheveposapi.codelabs.com.mx/Endpoints/Insert/InsertarRoles.php`,
          headers: {
            Authorization: `Bearer ${token}`
          },
          data: formData
        };

        const response = await axios.request(config);

        if (response.data.success===true) {
          toast.success("Rol agregado exitosamente");
          resetFormData();
          window.location.reload();
        } else {
          toast.error(response.data.message || "Error al guardar el Rol.");
        }

      } catch (error) {
        console.error("Error al enviar datos: ", error);
        toast.error("Error al agregar el rol");
      }
    }
  };




  return (
    <div>
      {/* Add Role */}
      <div className="modal fade" id="add-units" ref={modalRef}>
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Crear Rol</h4>
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
                    <div className="mb-0">
                      <label className="form-label">Rol</label>
                      <input
                        type="text"
                        className="form-control"
                        name="role"
                        value={formData.role}
                        onChange={(e) =>
                          setFormData({ ...formData, role: e.target.value })
                        }
                      />
                      {formErrors.role && (
                        <span className="text-danger">{formErrors.role}</span>
                      )}
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                        onClick={resetFormData}
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
      {/* /Add Role */}
    </div>
  );
};

export default AddRole;
