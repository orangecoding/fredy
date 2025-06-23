import React from 'react';
import { Table, Button, Input, Select, Banner, Modal } from '@douyinfe/semi-ui';
import { IconDelete, IconPlusCircle } from '@douyinfe/semi-icons';
import './CustomFieldsMutator.less';
import { nanoid } from 'nanoid';

export default function CustomFields({ value = [], onChange, jobToBeEdit }) {
  const handleAddField = () => {
    const newFields = [...value, { id: nanoid(), name: '', questionPrompt: '', answerLength: 'one_word' }];
    onChange(newFields);
  };

  const handleRemoveField = (id) => {
    const field = value.find(f => f.id === id);
    if (jobToBeEdit && typeof id === 'number' && id < Date.now() - 10000) {
      Modal.confirm({
        title: 'Delete Custom Field',
        content: 'Are you sure you want to delete this field? This will remove any associated data in the database.',
        okText: 'Delete field',
        cancelText: 'Cancel',
        onOk: () => {
          const newFields = value.filter((field) => field.id !== id);
          onChange(newFields);
        }
      });
    } else {
      const newFields = value.filter((field) => field.id !== id);
      onChange(newFields);
    }
  };

  const handleFieldChange = (id, field, fieldValue) => {
    const newFields = value.map(f =>
      f.id === id ? { ...f, [field]: fieldValue } : f
    );
    onChange(newFields);
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      className: 'customFieldsMutator__col--name',
      render: (text, record) => (
        <Input
          className="customFieldsMutator__input customFieldsMutator__input--name"
          value={record.name}
          onChange={val => handleFieldChange(record.id, 'name', val)}
          placeholder="Field name"
        />
      ),
    },
    {
      title: 'Question Prompt',
      dataIndex: 'questionPrompt',
      className: 'customFieldsMutator__col--prompt',
      render: (text, record) => (
        <Input
          className="customFieldsMutator__input customFieldsMutator__input--prompt"
          value={record.questionPrompt}
          onChange={val => handleFieldChange(record.id, 'questionPrompt', val)}
          placeholder="What question should be answered?"
        />
      ),
    },
    {
      title: 'Answer Length',
      dataIndex: 'answerLength',
      className: 'customFieldsMutator__col--length',
      render: (text, record) => (
        <Select
          className="customFieldsMutator__input customFieldsMutator__input--length"
          value={record.answerLength}
          onChange={val => handleFieldChange(record.id, 'answerLength', val)}
          optionList={[
            { value: 'one_word', label: 'One word/number' },
            { value: 'one_statement', label: 'One statement/sentence' },
            { value: 'several_sentences', label: 'Several sentences' },
          ]}
        />
      ),
    },
    {
      title: '',
      dataIndex: 'actions',
      className: 'customFieldsMutator__col--actions',
      render: (_, record) => (
        <Button
          type="danger"
          icon={<IconDelete />}
          onClick={() => handleRemoveField(record.id)}
        />
      ),
    },
  ];

  return (
    <div className="customFieldsMutator__container">
      <Banner
        fullMode={false}
        type="info"
        closeIcon={null}
        title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Custom Fields Information</div>}
        description="Define custom fields to be extracted from the expose using AI. Each field requires a name, a question prompt, and an answer length."
      />
      <div className="customFieldsMutator__addBtnRow">
        <Button
          type="primary"
          icon={<IconPlusCircle />}
          className="customFieldsMutator__addBtn"
          onClick={handleAddField}
        >
          Add Custom Field
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={value}
        pagination={false}
        emptyContent="No Custom Fields"
        rowKey="id"
      />
    </div>
  );
} 