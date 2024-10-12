import React, { useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";
import Cookies from "js-cookie";

const AddCustomer = () => {
  const [formData, setFormData] = useState({
    customerName: "",
    email: "",
    phone: "",
    address: ""
  });

  const [formErrors, setFormErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.customerName) {
      errors.customerName = "El nombre es obligatorio.";
      toast.error(errors.customerName);
    }
    if (!formData.email) {
      errors.email = "El correo es obligatorio.";
      toast.error(errors.email);
    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.email)) {
      errors.email = "El correo no es válido.";
      toast.error(errors.email);
    }
    if (!formData.phone) {
      errors.phone = "El teléfono es obligatorio.";
      toast.error(errors.phone);
    } else if (!/^\d+$/.test(formData.phone)) {
      errors.phone = "El teléfono solo debe contener números.";
      toast.error(errors.phone);
    }
    if (!formData.address) {
      errors.address = "La dirección es obligatoria.";
      toast.error(errors.address);
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const resetFormData = () => {
    setFormData({
      customerName: "",
      email: "",
      phone: "",
      address: ""
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = Cookies.get("authToken");
    if (validateForm()) {
      try {
        const config = {
          method: "post",
          url: `https://cheveposapi.codelabs.com.mx/Endpoints/Insert/InsertarCliente.php`,
          headers: {
            Authorization: `Bearer ${token}`
          },
          data: formData
        };

        const response = await axios.request(config);

        if (response.data.success === true) {
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
    <>
      <ToastContainer />
      {/* Add Customer */}
      <div className="modal fade" id="add-units">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Añadir Cliente</h4>
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
                    <div className="row">
                      <div className="col-lg-4 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Nombre Cliente</label>
                          <input
                            type="text"
                            className={`form-control ${
                              formErrors.customerName ? "is-invalid" : ""
                            }`}
                            name="customerName"
                            value={formData.customerName}
                            onChange={handleInputChange}
                          />
                          {formErrors.customerName && (
                            <div className="invalid-feedback">
                              {formErrors.customerName}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-4 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Correo</label>
                          <input
                            type="email"
                            className={`form-control ${
                              formErrors.email ? "is-invalid" : ""
                            }`}
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                          />
                          {formErrors.email && (
                            <div className="invalid-feedback">
                              {formErrors.email}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-4 pe-0">
                        <div className="input-blocks">
                          <label className="mb-2">Telefono</label>
                          <input
                            type="text"
                            className={`form-control ${
                              formErrors.phone ? "is-invalid" : ""
                            }`}
                            id="telefono"
                            name="phone"
                            value={formData.phone}
                            onChange={handleInputChange}
                          />
                          {formErrors.phone && (
                            <div className="invalid-feedback">
                              {formErrors.phone}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-12 pe-0">
                        <div className="mb-3">
                          <label className="form-label">Direccion</label>
                          <input
                            type="text"
                            className={`form-control ${
                              formErrors.address ? "is-invalid" : ""
                            }`}
                            name="address"
                            value={formData.address}
                            onChange={handleInputChange}
                          />
                          {formErrors.address && (
                            <div className="invalid-feedback">
                              {formErrors.address}
                            </div>
                          )}
                        </div>
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
      {/* /Add Customer */}
    </>
  );
};

export default AddCustomer;
