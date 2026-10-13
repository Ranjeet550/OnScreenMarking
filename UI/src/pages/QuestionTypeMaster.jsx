import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Layers, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { questionTypeService } from '../services';
import { useBreadcrumb } from '../context/BreadcrumbContext';
import message from '../services/messageService';

export default function QuestionTypeMaster() {
  const { userType } = useAuth();
  const { setBreadcrumb } = useBreadcrumb();
  
  const [questionTypes, setQuestionTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    questionTypeName: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const parentPath = userType === 'admin' ? '/admin/dashboard' : '/coordinator/dashboard';
    setBreadcrumb([
      { label: 'Dashboard', path: parentPath, icon: 'Home' },
      { label: 'Question Types', path: '/admin/question-types', icon: 'Layers' }
    ]);
    fetchQuestionTypes();
  }, [userType]);

  const fetchQuestionTypes = async () => {
    try {
      setLoading(true);
      const data = await questionTypeService.getAllQuestionTypes();
      setQuestionTypes(data || []);
    } catch (err) {
      message.error('Failed to fetch question types');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.questionTypeName.trim()) {
      message.error('Question type name is required.');
      return;
    }
    
    try {
      setLoading(true);
      
      await questionTypeService.createQuestionType(formData);
      message.success('Question type created successfully');
      setFormData({ questionTypeName: '' });
      setShowForm(false);
      fetchQuestionTypes();
    } catch (err) {
      message.error(err.message || 'Error saving question type');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete the question type "${name}"?`)) {
      try {
        setLoading(true);
        
        await questionTypeService.deleteQuestionType(id);
        message.success('Question type deleted successfully');
        fetchQuestionTypes();
      } catch (err) {
        message.error(err.message || 'Failed to delete question type');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCancel = () => {
    setFormData({ questionTypeName: '' });
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      <div className="w-full space-y-4">
        {/* Header */}
        <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                Question Types
              </h1>
              <p className="text-xs text-gray-500 mt-1">Define question type tags for section setup (e.g. MCQ, SA, LA)</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer ${
                showForm 
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200' 
                  : 'bg-teal-700 hover:bg-teal-800 text-white'
              }`}
            >
              <Plus size={13} className={showForm ? 'rotate-45 transition-transform' : 'transition-transform'} />
              <span>{showForm ? 'Cancel' : 'Add Type'}</span>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
          {loading && questionTypes.length === 0 ? (
            <div className="p-12 text-center text-gray-400 font-bold text-xs flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <span>Loading question types...</span>
            </div>
          ) : questionTypes.length === 0 ? (
            <div className="p-16 text-center text-gray-500 font-medium leading-relaxed max-w-sm mx-auto space-y-3">
              <div>
                <h3 className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">No Question Types Defined</h3>
                <p className="text-[10px] text-gray-400 mt-1">Create the master list of question types for examinations</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between md:px-6 px-4">
                <span className="text-[10px] font-black text-gray-450 uppercase tracking-widest">Active Question Types</span>
                <span className="bg-teal-100 text-teal-700 text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider border border-teal-200">
                  {questionTypes.length} types
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {questionTypes.map((qt) => (
                  <div
                    key={qt.questionTypeId}
                    className="flex justify-between items-center py-2.5 hover:bg-gray-50/50 transition-colors group md:px-6 px-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-700 font-extrabold text-xs flex items-center justify-center shadow-sm">
                        <Layers size={16} />
                      </span>
                      <span className="font-extrabold text-gray-900">{qt.questionTypeName}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(qt.questionTypeId, qt.questionTypeName)}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden border border-gray-100 shadow-2xl flex flex-col animate-scale-up">
            
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">
                  Add New Question Type
                </h3>
              </div>
              <button 
                onClick={handleCancel}
                className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-md transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form id="question-type-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-5 p-4 md:p-6">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Question Type Name *</label>
                <input
                  type="text"
                  required
                  value={formData.questionTypeName}
                  onChange={(e) => setFormData({ ...formData, questionTypeName: e.target.value })}
                  placeholder="e.g. MCQ, SA, LA, EXP, LIT"
                  className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
                />
              </div>
            </form>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-md font-bold text-xs cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="question-type-form"
                disabled={loading}
                className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-xs cursor-pointer shadow transition disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Create Question Type'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

