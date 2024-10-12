import React, { useState, useEffect } from "react";
import PropTypes from "prop-types"; //
import Select from "react-select";
import { fetchCategories } from "../../Data/Inventario/category"; // I

const EditSubcategories = ({ SubcategoryData }) => {
  const [categoryName, setCategoryName] = useState("");
  const [subcategoryName, setSubCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(true);
  const [categories, setCategories] = useState([]); // Para almacenar la lista de categorías

  useEffect(() => {
    const loadInitialData = async () => {
      const categoryData = await fetchCategories();
      setCategories(categoryData);
    };

    loadInitialData();
  }, []);

  useEffect(() => {
    if (SubcategoryData) {
      const selectedCategory = categories.find(
        (cat) => cat.label === SubcategoryData.CategoriaPadre
      );
      setCategoryName(selectedCategory || null);
      setSubCategoryName(SubcategoryData.valor || "");
      setDescription(SubcategoryData.etiqueta || "");
      setStatus(SubcategoryData.estatus === 1);
    }
  }, [SubcategoryData, categories]); // Asegúrate de volver a calcular si las categorías cambian
  const handleUpdateCategory = () => {
    console.log("Updated Category:", {
      categoryName: categoryName ? categoryName.label : "",
      subcategoryName,
      description,
      status
    });
  };

  return (
    <div>
      {/* Edit Category */}
      <div className="modal fade" id="edit-category">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Editar Subcategoria</h4>
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
                  <form>
                    <div className="mb-3">
                      <label className="form-label">Categoria Padre</label>
                      <Select
        options={categories}
        value={categoryName}
        onChange={(selectedOption) => setCategoryName(selectedOption)}
        placeholder="Selecciona una categoría"
      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Category Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={subcategoryName}
                        onChange={(e) => setSubCategoryName(e.target.value)}
                      />
                    </div>
                    <div className="mb-3 input-blocks">
                      <label className="form-label">Description</label>
                      <textarea
                        type="text"
                        className="form-control"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                    <div className="mb-0">
                      <div className="status-toggle modal-status d-flex justify-content-between align-items-center">
                        <span className="status-label">Status</span>
                        <input
                          type="checkbox"
                          id="SubcategoryCheck"
                          className="check"
                          checked={status}
                          onChange={(e) => setStatus(e.target.checked)}
                        />
                        <label htmlFor="SubcategoryCheck" className="checktoggle" />
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-submit"
                        onClick={handleUpdateCategory}
                      >
                        Actualizar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /Edit Category */}
    </div>
  );
};
EditSubcategories.propTypes = {
  SubcategoryData: PropTypes.shape({
    CategoriaPadre: PropTypes.string.isRequired,
    valor: PropTypes.string.isRequired,
    etiqueta: PropTypes.string.isRequired,
    estatus: PropTypes.number.isRequired
  })
};
export default EditSubcategories;
