import React, { useState, useEffect } from 'react';
import { FaSpinner, FaCheck } from 'react-icons/fa';
import axios from '../../API/axios';

const DynamicTableSection = ({ section, tagValues, showHeader = true }) => {
  const [groupTags, setGroupTags] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load tags from tag group (for dynamic rows)
  useEffect(() => {
    const loadGroupTags = async () => {
      const tagGroupId = section.table_config?.tag_group_id;
      const tagGroupName = section.table_config?.tag_group;
      
      if (!tagGroupId && !tagGroupName) {
        setLoading(false);
        return;
      }

      try {
        let response;
        if (tagGroupId) {
          // Load by ID
          response = await axios.get(`/api/tag-groups/${tagGroupId}`, { timeout: 10000 });
        } else {
          // Load by name - get all groups and find by name (case-insensitive)
          const allGroupsResponse = await axios.get('/api/tag-groups', {
            params: { is_active: 'true' },
            timeout: 10000
          });
          
          if (allGroupsResponse.data.status === 'success') {
            // Case-insensitive matching
            const group = allGroupsResponse.data.tag_groups?.find(
              g => g.group_name?.toLowerCase() === tagGroupName?.toLowerCase()
            );
            
            if (group) {
              response = await axios.get(`/api/tag-groups/${group.id}`, { timeout: 10000 });
            } else {
              console.warn(`[DynamicTableSection] Tag group "${tagGroupName}" not found. Available groups:`, 
                allGroupsResponse.data.tag_groups?.map(g => g.group_name));
            }
          }
        }
        
        if (response && response.data.status === 'success') {
          const tags = response.data.tag_group.tags || [];
          console.log(`[DynamicTableSection] Loaded ${tags.length} tags from group "${tagGroupName || tagGroupId}":`, 
            tags.map(t => t.tag_name));
          setGroupTags(tags);
          
          // ✅ Trigger loading of related tags for pattern-based columns
          // This will be handled by the parent component (DynamicReport) when it detects
          // tag group members and column patterns
        } else {
          console.error(`[DynamicTableSection] Failed to load tag group:`, tagGroupName || tagGroupId);
          setGroupTags([]);
        }
      } catch (e) {
        console.error('[DynamicTableSection] Error loading tag group:', e);
        setGroupTags([]);
      } finally {
        setLoading(false);
      }
    };

    loadGroupTags();
  }, [section.table_config]);

  // For static rows, ensure loading is false if no tag group is needed
  useEffect(() => {
    const rowMode = section.table_config?.row_mode || 'static';
    const isDynamic = rowMode === 'dynamic' || rowMode === 'Dynamic';
    
    if (!isDynamic) {
      // For static rows, we don't need to load tag groups
      setLoading(false);
    }
  }, [section.table_config]);

  const formatValue = (value, decimals, unit) => {
    if (value === null || value === undefined) return '-';
    
    let formatted = value;
    if (typeof value === 'number') {
      // If decimals is 0 or value is a whole number and no unit, show as integer
      if (decimals === 0 || (value % 1 === 0 && !unit)) {
        formatted = Math.round(value).toString();
      } else {
        formatted = value.toFixed(decimals || 2);
      }
    }
    
    return unit ? `${formatted} ${unit}` : formatted;
  };

  const getCellValue = (column, row, isDynamic) => {
    if (!isDynamic) {
      // For static rows: get value from row's cell configuration for this column
      const cellConfig = (row.cells || []).find(c => c.column_id === column.id);
      
      // ✅ AUTO-RESOLVE: For MATERIAL_NAME columns, automatically use material name
      const isMaterialColumn = column.column_label && 
        column.column_label.toUpperCase().includes('MATERIAL');
      
      if (isMaterialColumn) {
        console.log(`[DynamicTableSection] MATERIAL column detected: ${column.column_label}`);
        console.log(`[DynamicTableSection] Cell config:`, cellConfig);
        
        // First, try to get tag_name from this cell
        let tagName = cellConfig?.tag_name;
        let tagValue = tagName ? tagValues[tagName] : null;
        
        console.log(`[DynamicTableSection] Initial tagName: ${tagName}, tagValue: ${tagValue}`);
        
        // If no tag_name in this cell, look for bin_code/bin_id tags in other cells of the same row
        if (!tagName || !tagValue) {
          const allRowCells = row.cells || [];
          for (const cell of allRowCells) {
            if (cell.tag_name) {
              const cellTagName = cell.tag_name.toLowerCase();
              // Check if this cell has a bin_code or bin_id tag
              if (cellTagName.includes('bin_code') || cellTagName.includes('bincode') || 
                  cellTagName.includes('binid') || cellTagName.includes('bin_id')) {
                tagName = cell.tag_name;
                tagValue = tagValues[tagName];
                if (tagValue) break; // Found a bin tag with a value
              }
            }
          }
        }
        
        if (tagName && tagValue) {
          console.log(`[DynamicTableSection] Looking for material name for tag: ${tagName} = ${tagValue}`);
          console.log(`[DynamicTableSection] Available tag values:`, Object.keys(tagValues).filter(k => k.includes('Material') || k.includes('material')));
          
          // Try to find material name tag (multiple patterns to handle different naming conventions)
          const materialTagPatterns = [
            `${tagName}_MaterialName`,           // receiver_bin_id_1 -> receiver_bin_id_1_MaterialName
            `${tagName}MaterialName`,            // receiver_bin_id_1 -> receiver_bin_id_1MaterialName
            tagName.replace(/(\d+)$/, '$1MaterialName'),  // receiver_bin_id_1 -> receiver_bin_id_1MaterialName
            tagName.replace('_', '') + 'MaterialName',     // receiver_bin_id_1 -> receiverbin_id_1MaterialName
            tagName.replace(/_(\d+)$/, '$1MaterialName'), // receiver_bin_id_1 -> receiver_bin_id1MaterialName
            tagName.replace(/[_\s]/g, '') + 'MaterialName', // receiver_bin_id_1 -> receiverbinid1MaterialName
            // ✅ ADD THESE LINES for bin_code/bin_id support
            tagName.replace('BinCode', 'MaterialName').replace('bin_code', 'material_name'),
            tagName.replace('BinCode', '').replace('bin_code', '') + 'MaterialName',
            tagName.replace(/BinCode/i, 'MaterialName').replace(/bin_code/i, 'material_name'),
            tagName.replace('BinId', 'MaterialName').replace('bin_id', 'material_name'),
            tagName.replace('BinId', '').replace('bin_id', '') + 'MaterialName',
            tagName.replace(/BinId/i, 'MaterialName').replace(/bin_id/i, 'material_name'),
            // Additional patterns for receiver_bin_id_1 style
            tagName.replace('_bin_id_', '_material_name_').replace('_bin_id', '_material_name'),
            tagName.replace('_bin_id_', '_MaterialName_').replace('_bin_id', '_MaterialName'),
            tagName.replace(/bin_id/g, 'material_name').replace(/BinId/g, 'MaterialName')
          ];
          
          // Try each pattern - but only match tags that are actually material name tags
          for (const pattern of materialTagPatterns) {
            // Skip if pattern matches the original tag name (we want material tags, not bin tags)
            if (pattern === tagName) continue;
            
            // Only match tags that contain "MaterialName" or "material_name" (actual material tags)
            const isMaterialTag = pattern.toLowerCase().includes('materialname') || 
                                  pattern.toLowerCase().includes('material_name');
            
            if (isMaterialTag && tagValues[pattern]) {
              const materialValue = tagValues[pattern];
              // Make sure it's actually a string (material name), not a number (bin_code)
              if (typeof materialValue === 'string' && materialValue.trim() !== '') {
                console.log(`[DynamicTableSection] ✅ Auto-resolved material name: ${tagName} -> ${pattern} = ${materialValue}`);
                return materialValue;
              }
            }
          }
          
          console.log(`[DynamicTableSection] ⚠️ No material name tag found for ${tagName}. Tried patterns:`, materialTagPatterns);
          
          // If no material tag found, check if we can find it by matching bin ID values
          // Find all material tags and check if their corresponding bin ID tag matches
          const allMaterialTags = Object.keys(tagValues).filter(k => 
            (k.includes('MaterialName') || k.includes('material_name')) && tagValues[k]
          );
          
          console.log(`[DynamicTableSection] Found ${allMaterialTags.length} material tags:`, allMaterialTags);
          
          for (const matTag of allMaterialTags) {
            // Try to find the corresponding bin ID tag
            const binTagPatterns = [
              matTag.replace('MaterialName', 'BinId').replace('material_name', 'bin_id'),
              matTag.replace('MaterialName', '').replace('material_name', ''),
              matTag.replace(/(MaterialName|material_name)/i, 'BinId'),
              matTag.replace(/(MaterialName|material_name)/i, ''),
              // ✅ ADD THESE LINES for bin_code/bin_id support
              matTag.replace('MaterialName', 'BinCode').replace('material_name', 'bin_code'),
              matTag.replace(/(MaterialName|material_name)/i, 'BinCode'),
              matTag.replace(/(MaterialName|material_name)/i, 'bin_code'),
              // Additional patterns for receiver_bin_id_1 style
              matTag.replace('_material_name_', '_bin_id_').replace('_material_name', '_bin_id'),
              matTag.replace('_MaterialName_', '_BinId_').replace('_MaterialName', '_BinId'),
              matTag.replace(/material_name/g, 'bin_id').replace(/MaterialName/g, 'BinId')
            ];
            
            for (const binPattern of binTagPatterns) {
              if (tagValues[binPattern] === tagValue && tagValue > 0) {
                console.log(`[DynamicTableSection] ✅ Auto-resolved material name by bin ID match: ${tagName} (${tagValue}) -> ${matTag} = ${tagValues[matTag]}`);
                return tagValues[matTag];
              }
            }
          }
          
          // ✅ If tagValue exists but no material found, return "N/A" instead of showing bin_code value
          console.log(`[DynamicTableSection] ⚠️ No material found for bin_code ${tagValue}, returning N/A`);
          return 'N/A';
        }
        
        // ✅ If no tag_name or tagValue, return "N/A" instead of hardcoded text
        console.log(`[DynamicTableSection] ⚠️ No tag_name or tagValue found for MATERIAL column, returning N/A`);
        return 'N/A';
      }
      
      // Continue with normal logic for non-MATERIAL columns
      if (cellConfig && cellConfig.tag_name) {
        const displayType = cellConfig.display_type || 'value';
        
        if (displayType === 'name') {
          // Show tag name or manual name
          if (cellConfig.use_manual_name && cellConfig.manual_name) {
            return cellConfig.manual_name;
          } else {
            return cellConfig.tag_name;
          }
        } else {
          // Show tag value
          const tagName = cellConfig.tag_name;
          const tagValue = tagValues[tagName];
          
          // If value is undefined, return null (will show as "-")
          if (tagValue === undefined) {
            return null;
          }
          return tagValue;
        }
      }
      // If display type is 'name' but no tag_name, check for manual_name
      if (cellConfig && cellConfig.display_type === 'name' && cellConfig.use_manual_name && cellConfig.manual_name) {
        return cellConfig.manual_name;
      }
      return null;
    } else {
      // For dynamic rows: get value from tag in group (row is the tag object)
      // Support pattern-based tag names like {tag_name}Weight, {tag_name}QtyPercent
      // ✅ FIX: For bin_id tags, always use original tag_name (not matchedKey) to ensure ID column shows correct value
      const isBinIdRow = (row.tag_name || '').toLowerCase().includes('bin_id') || 
                        (row.tag_name || '').toLowerCase().includes('binid') ||
                        ((row.tag_name || '').toLowerCase().includes('bin') && (row.tag_name || '').toLowerCase().includes('id'));
      
      // For bin_id tags, use tag_name; for others, use matchedKey if available
      const baseTagName = isBinIdRow ? (row.tag_name || row.matchedKey) : (row.matchedKey || row.tag_name);
      if (!baseTagName) {
        return null;
      }
      
      // Get column tag_name (may contain pattern like {tag_name}Weight)
      const columnTagName = column.tag_name || '';
      
      // ✅ FIX: Check for ID column FIRST, before any pattern matching
      const columnLabel = (column.column_label || '').toUpperCase();
      const isBinIdColumn = (columnLabel.includes('BIN') && (columnLabel.includes('ID') || columnLabel.includes('CODE'))) || 
                            (columnLabel === 'ID' && !columnLabel.includes('MATERIAL'));
      
      // If this is the ID column, return bin_id value immediately (don't do pattern matching)
      if (isBinIdColumn) {
        // ✅ FIX: Check if baseTagName is a weight tag (contains "bin" but not "id")
        const isWeightTag = baseTagName.toLowerCase().includes('bin') && 
                           !baseTagName.toLowerCase().includes('id') &&
                           !baseTagName.toLowerCase().includes('code');
        
        // If it's a weight tag, extract bin_id from the tag name itself (e.g., "21" from "FCL_Source_bin_21")
        if (isWeightTag) {
          const binIdMatch = baseTagName.match(/bin[_\s]*(\d+[A-C]?)/i);
          if (binIdMatch) {
            const binIdStr = binIdMatch[1];
            // Convert 21A -> 211, 21B -> 212, 21C -> 213
            let binIdValue;
            if (binIdStr.endsWith('A')) {
              binIdValue = parseInt(binIdStr.slice(0, -1)) * 10 + 1;
            } else if (binIdStr.endsWith('B')) {
              binIdValue = parseInt(binIdStr.slice(0, -1)) * 10 + 2;
            } else if (binIdStr.endsWith('C')) {
              binIdValue = parseInt(binIdStr.slice(0, -1)) * 10 + 3;
            } else {
              binIdValue = parseInt(binIdStr);
            }
            if (!isNaN(binIdValue)) {
              console.log(`[DynamicTableSection] ✅ Extracted bin_id ${binIdValue} from weight tag "${baseTagName}"`);
              return binIdValue;
            }
          }
        }
        
        // If baseTagName is a bin_id tag, get the value from tagValues
        let binIdValue = tagValues[baseTagName];
        
        // If value is a number and looks like a bin_id (integer > 0), return it
        if (binIdValue !== undefined && binIdValue !== null) {
          const binIdNum = typeof binIdValue === 'string' ? parseFloat(binIdValue) : Number(binIdValue);
          // Only return if it's a valid integer bin_id (not a weight value like 24.02)
          if (!isNaN(binIdNum) && binIdNum > 0 && Number.isInteger(binIdNum)) {
            return binIdNum;
          }
          // If it's not an integer, it might be a weight value - try to find the actual bin_id tag
        }
        
        // Try to extract bin_id from tag name patterns like FCL_Source_bin_21, FCL_Source_bin_21A, etc.
        const binIdMatch = baseTagName.match(/bin[_\s]*(\d+[A-C]?)/i);
        if (binIdMatch) {
          const binIdStr = binIdMatch[1];
          // Convert 21A -> 211, 21B -> 212, 21C -> 213
          let extractedBinId;
          if (binIdStr.endsWith('A')) {
            extractedBinId = parseInt(binIdStr.slice(0, -1)) * 10 + 1;
          } else if (binIdStr.endsWith('B')) {
            extractedBinId = parseInt(binIdStr.slice(0, -1)) * 10 + 2;
          } else if (binIdStr.endsWith('C')) {
            extractedBinId = parseInt(binIdStr.slice(0, -1)) * 10 + 3;
          } else {
            extractedBinId = parseInt(binIdStr);
          }
          if (!isNaN(extractedBinId)) {
            console.log(`[DynamicTableSection] ✅ Extracted bin_id ${extractedBinId} from tag name "${baseTagName}"`);
            return extractedBinId;
          }
        }
        
        // Try to find corresponding bin_id tag from source number
        const sourceMatch = baseTagName.match(/FCL[_\s]*SOURCE[_\s]*(\d+)/i);
        if (sourceMatch) {
          const sourceNum = sourceMatch[1];
          const binIdTagPatterns = [
            `FCL_source_${sourceNum}_bin_id`,
            `FCL_SOURCE_${sourceNum}_BIN_ID`,
            `FCL_source_${sourceNum}_binid`,
            `FCL_SOURCE_${sourceNum}_BINID`
          ];
          
          for (const pattern of binIdTagPatterns) {
            const value = tagValues[pattern];
            if (value !== undefined && value !== null) {
              const binIdNum = typeof value === 'string' ? parseFloat(value) : Number(value);
              // Only return if it's a valid integer bin_id
              if (!isNaN(binIdNum) && binIdNum > 0 && Number.isInteger(binIdNum)) {
                console.log(`[DynamicTableSection] ✅ Found bin_id ${binIdNum} from tag "${pattern}"`);
                return binIdNum;
              }
            }
          }
        }
        
        return null;
      }
      
      // ✅ AUTO-RESOLVE: For MATERIAL columns, automatically use material name
      const isMaterialColumn = column.column_label && 
        column.column_label.toUpperCase().includes('MATERIAL');
      
      if (isMaterialColumn) {
        // Get bin_id value from the base tag (row.tag_name)
        const binValue = tagValues[baseTagName];
        
        if (binValue && binValue !== 0) {
          // Try to find material name tag using patterns
          const materialTagPatterns = [
            `${baseTagName}_MaterialName`,
            `${baseTagName}MaterialName`,
            baseTagName.replace(/(\d+)$/, '$1MaterialName'),
            baseTagName.replace('_', '') + 'MaterialName',
            baseTagName.replace(/_(\d+)$/, '$1MaterialName'),
            baseTagName.replace(/[_\s]/g, '') + 'MaterialName',
            baseTagName.replace('BinCode', 'MaterialName').replace('bin_code', 'material_name'),
            baseTagName.replace('BinCode', '').replace('bin_code', '') + 'MaterialName',
            baseTagName.replace(/BinCode/i, 'MaterialName').replace(/bin_code/i, 'material_name'),
            baseTagName.replace('BinId', 'MaterialName').replace('bin_id', 'material_name'),
            baseTagName.replace('BinId', '').replace('bin_id', '') + 'MaterialName',
            baseTagName.replace(/BinId/i, 'MaterialName').replace(/bin_id/i, 'material_name'),
            baseTagName.replace('_bin_id_', '_material_name_').replace('_bin_id', '_material_name'),
            baseTagName.replace('_bin_id_', '_MaterialName_').replace('_bin_id', '_MaterialName'),
            baseTagName.replace(/bin_id/g, 'material_name').replace(/BinId/g, 'MaterialName')
          ];
          
          for (const pattern of materialTagPatterns) {
            if (pattern !== baseTagName && tagValues[pattern]) {
              const materialValue = tagValues[pattern];
              if (typeof materialValue === 'string' && materialValue.trim() !== '') {
                return materialValue;
              }
            }
          }
          
          // Try reverse lookup by matching bin_id values
          const allMaterialTags = Object.keys(tagValues).filter(k => 
            (k.includes('MaterialName') || k.includes('material_name')) && tagValues[k]
          );
          
          for (const matTag of allMaterialTags) {
            const binTagPatterns = [
              matTag.replace('MaterialName', 'BinId').replace('material_name', 'bin_id'),
              matTag.replace('MaterialName', '').replace('material_name', ''),
              matTag.replace(/(MaterialName|material_name)/i, 'BinId'),
              matTag.replace(/(MaterialName|material_name)/i, ''),
              matTag.replace('MaterialName', 'BinCode').replace('material_name', 'bin_code'),
              matTag.replace(/(MaterialName|material_name)/i, 'BinCode'),
              matTag.replace(/(MaterialName|material_name)/i, 'bin_code'),
              matTag.replace('_material_name_', '_bin_id_').replace('_material_name', '_bin_id'),
              matTag.replace('_MaterialName_', '_BinId_').replace('_MaterialName', '_BinId'),
              matTag.replace(/material_name/g, 'bin_id').replace(/MaterialName/g, 'BinId')
            ];
            
            for (const binPattern of binTagPatterns) {
              if (tagValues[binPattern] === binValue && binValue > 0) {
                return tagValues[matTag];
              }
            }
          }
        }
        
        // If no material found, return "N/A"
        return 'N/A';
      }
      
      // Handle empty or generic column tag_name - try to infer from column label
      if (!columnTagName || columnTagName === '{tag_name}' || columnTagName.trim() === '') {
        // Extract source number from baseTagName and try to match column label
        const sourceMatch = baseTagName.match(/(FCL_SOURCE_)(\d+)(_)/i);
        if (sourceMatch) {
          const sourceNumber = sourceMatch[2];
          const columnLabel = (column.column_label || '').toUpperCase();
          
          // Build tag name patterns based on column label
          const labelBasedPatterns = [];
          
          // ✅ FIX: Get bin_id value for weight lookup
          const binIdValue = tagValues[baseTagName];
          
          // ID column check already handled at the top, skip here
          
          if (columnLabel.includes('WEIGHT') || columnLabel.includes('QTT') || columnLabel.includes('PRODUCE')) {
            // ✅ FIX: Get bin_id value from baseTagName (it's a bin_id tag, so value is the bin_id)
            let actualBinId = binIdValue;
            
            // If binIdValue is not available, try to extract from baseTagName
            if (!actualBinId || actualBinId === 0) {
              // baseTagName is like "FCL_source_1_bin_id", get the bin_id value
              const binIdTagValue = tagValues[baseTagName];
              if (binIdTagValue !== undefined && binIdTagValue !== null) {
                actualBinId = typeof binIdTagValue === 'string' ? parseFloat(binIdTagValue) : Number(binIdTagValue);
              }
            }
            
            // ✅ FIX: First try source-based patterns
            labelBasedPatterns.push(
              `FCL_SOURCE_${sourceNumber}_WEIGHT`,
              `FCL_SOURCE_${sourceNumber}_Weight`,
              `FCL_source_${sourceNumber}_weight`,
              `FCL_SOURCE_${sourceNumber}_PRODUCED_QTY`,
              `FCL_source_${sourceNumber}_produced_qty`,
            );
            
            // ✅ FIX: Also try bin_id-based patterns (FCL_Source_bin_21) if bin_id is available
            if (actualBinId !== undefined && actualBinId !== null && actualBinId !== 0) {
              const binIdNum = typeof actualBinId === 'string' ? parseFloat(actualBinId) : Number(actualBinId);
              if (!isNaN(binIdNum) && binIdNum > 0) {
                // Try multiple variations for bin-based weight tags
                labelBasedPatterns.push(
                  `FCL_Source_bin_${binIdNum}`,
                  `FCL_source_bin_${binIdNum}`,
                  `FCL_SOURCE_BIN_${binIdNum}`,
                  `FCL_Source_bin_${binIdNum.toString().padStart(2, '0')}`,
                  `FCL_source_bin_${binIdNum.toString().padStart(2, '0')}`,
                );
                
                // Also try with converted bin codes (211->21A, 212->21B, 213->21C)
                if (binIdNum === 211) {
                  labelBasedPatterns.push('FCL_Source_bin_21A', 'FCL_source_bin_21A', 'FCL_SOURCE_BIN_21A');
                } else if (binIdNum === 212) {
                  labelBasedPatterns.push('FCL_Source_bin_21B', 'FCL_source_bin_21B', 'FCL_SOURCE_BIN_21B');
                } else if (binIdNum === 213) {
                  labelBasedPatterns.push('FCL_Source_bin_21C', 'FCL_source_bin_21C', 'FCL_SOURCE_BIN_21C');
                }
              }
            }
          }
          if (columnLabel.includes('PRD_CODE') || (columnLabel.includes('PRD') && columnLabel.includes('CODE'))) {
            labelBasedPatterns.push(
              `FCL_SOURCE_${sourceNumber}_PRD_CODE`,
              `FCL_SOURCE_${sourceNumber}_PrdCode`,
              `FCL_source_${sourceNumber}_prd_code`,
            );
          }
          if (columnLabel.includes('QTY') || columnLabel.includes('PERCENT')) {
            labelBasedPatterns.push(
              `FCL_SOURCE_${sourceNumber}_QTY_PERCENT`,
              `FCL_SOURCE_${sourceNumber}_QtyPercent`,
              `FCL_source_${sourceNumber}_qty_percent`,
            );
          }
          if (columnLabel.includes('ACTIVE')) {
            labelBasedPatterns.push(
              `FCL_SOURCE_${sourceNumber}_ACTIVE`,
              `FCL_SOURCE_${sourceNumber}_Active`,
              `FCL_source_${sourceNumber}_active`,
              `FCL_SOURCE_${sourceNumber}_IS_ACTIVE`,
              `FCL_source_${sourceNumber}_is_active`,
            );
          }
          if (columnLabel.includes('VALUES') || columnLabel.includes('VALUE')) {
            labelBasedPatterns.push(
              `FCL_SOURCE_${sourceNumber}_WEIGHT`,
              `FCL_SOURCE_${sourceNumber}_QTY_PERCENT`,
              `FCL_SOURCE_${sourceNumber}_PRD_CODE`,
            );
          }
          
          // Try label-based patterns (with case-insensitive fallback)
          for (const pattern of labelBasedPatterns) {
            // Try exact match first
            if (tagValues[pattern] !== undefined) {
              const value = tagValues[pattern];
              if (value !== null && value !== undefined) {
                console.log(`[DynamicTableSection] ✅ Matched empty tag_name using column label "${column.column_label}": ${pattern} = ${value}`);
                return value;
              }
            }
            
            // Try case-insensitive match
            const matchingKey = Object.keys(tagValues).find(k => k.toLowerCase() === pattern.toLowerCase());
            if (matchingKey && tagValues[matchingKey] !== undefined) {
              const value = tagValues[matchingKey];
              if (value !== null && value !== undefined) {
                console.log(`[DynamicTableSection] ✅ Matched empty tag_name (case-insensitive) using column label "${column.column_label}": ${matchingKey} = ${value}`);
                return value;
              }
            }
          }
          
          // ✅ FALLBACK: If no match found, try to find weight tag by bin_id number in tag name
          if (columnLabel.includes('WEIGHT') && binIdValue !== undefined && binIdValue !== null && binIdValue !== 0) {
            const binIdNum = typeof binIdValue === 'string' ? parseFloat(binIdValue) : Number(binIdValue);
            if (!isNaN(binIdNum) && binIdNum > 0) {
              // Search for any tag that contains the bin_id number and looks like a weight tag
              const binIdStr = binIdNum.toString();
              const matchingWeightTag = Object.keys(tagValues).find(k => {
                const kLower = k.toLowerCase();
                // Must contain the bin_id number and look like a weight tag (contains "bin" but not "id" or "material")
                return kLower.includes(binIdStr) && 
                       (kLower.includes('bin') || kLower.includes('source')) &&
                       !kLower.includes('id') && 
                       !kLower.includes('material') &&
                       !kLower.includes('code');
              });
              
              if (matchingWeightTag && tagValues[matchingWeightTag] !== undefined) {
                const value = tagValues[matchingWeightTag];
                if (value !== null && value !== undefined) {
                  console.log(`[DynamicTableSection] ✅ Found weight tag by bin_id fallback: ${matchingWeightTag} = ${value}`);
                  return value;
                }
              }
            }
          }
          
          // If still no match found, log available weight-related tags for debugging
          if (columnLabel.includes('WEIGHT') && labelBasedPatterns.length > 0) {
            const weightTags = Object.keys(tagValues).filter(k => 
              k.toLowerCase().includes('weight') || 
              (k.toLowerCase().includes('bin') && !k.toLowerCase().includes('id'))
            );
            console.log(`[DynamicTableSection] ⚠️ No weight tag found for "${column.column_label}". Tried patterns:`, labelBasedPatterns.slice(0, 10));
            console.log(`[DynamicTableSection] Available weight-related tags:`, weightTags.slice(0, 20));
            console.log(`[DynamicTableSection] baseTagName: ${baseTagName}, binIdValue: ${binIdValue}`);
          }
        }
      }
      
      // Handle pattern-based tag names (e.g., {tag_name}Weight, {tag_name}QtyPercent)
      if (columnTagName && columnTagName.includes('{tag_name}')) {
        // Extract suffix from pattern (e.g., "Weight", "QtyPercent", "PrdCode")
        const suffix = columnTagName.replace('{tag_name}', '').trim();
        
        // Normalize suffix to handle common variations
        const suffixLower = suffix.toLowerCase();
        const suffixUpper = suffix.toUpperCase();
        const suffixCapitalized = suffix.charAt(0).toUpperCase() + suffix.slice(1);
        
        // Generate multiple pattern variations to try
        // For FCL_SOURCE_1_BIN_ID -> FCL_SOURCE_1_WEIGHT, FCL_SOURCE_1_PRD_CODE, etc.
        const patternVariations = [
          // Pattern 1: Replace BIN_ID/BINID with suffix (FCL_SOURCE_1_BIN_ID -> FCL_SOURCE_1_WEIGHT)
          baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, suffixUpper),
          baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, suffixCapitalized),
          baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, suffix),
          baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, suffixLower),
          // Pattern 2: Replace BIN_CODE/BINCODE with suffix
          baseTagName.replace(/BIN_CODE|BINCODE|BinCode|bin_code|bincode/i, suffixUpper),
          baseTagName.replace(/BIN_CODE|BINCODE|BinCode|bin_code|bincode/i, suffixCapitalized),
          // Pattern 3: Remove BinId/BinCode suffix and add suffix (FCL_SOURCE_1 -> FCL_SOURCE_1_WEIGHT)
          baseTagName.replace(/[_\s]*(BIN_ID|BINID|BinId|bin_id|binid|BIN_CODE|BINCODE|BinCode|bin_code|bincode)[_\s]*$/i, '') + '_' + suffixUpper,
          baseTagName.replace(/[_\s]*(BIN_ID|BINID|BinId|bin_id|binid|BIN_CODE|BINCODE|BinCode|bin_code|bincode)[_\s]*$/i, '') + '_' + suffixCapitalized,
          baseTagName.replace(/[_\s]*(BIN_ID|BINID|BinId|bin_id|binid|BIN_CODE|BINCODE|BinCode|bin_code|bincode)[_\s]*$/i, '') + suffixCapitalized,
          // Pattern 4: Direct replacement (for cases where {tag_name} is the full tag)
          columnTagName.replace(/{tag_name}/g, baseTagName),
          // Pattern 5: For FCL patterns - extract source number and rebuild
          baseTagName.replace(/(FCL_SOURCE_\d+)[_\s]*(BIN_ID|BINID|BinId|bin_id|binid)/i, `$1_${suffixUpper}`),
          baseTagName.replace(/(FCL_SOURCE_\d+)[_\s]*(BIN_ID|BINID|BinId|bin_id|binid)/i, `$1_${suffixCapitalized}`),
        ];
        
        // Also try common FCL-specific patterns based on column label
        const columnLabel = (column.column_label || '').toUpperCase();
        if (columnLabel.includes('WEIGHT') || columnLabel.includes('QTT') || columnLabel.includes('PRODUCE')) {
          patternVariations.push(
            baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, 'WEIGHT'),
            baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, 'Weight'),
            baseTagName.replace(/(FCL_SOURCE_\d+)[_\s]*(BIN_ID|BINID|BinId|bin_id|binid)/i, '$1_WEIGHT'),
          );
          
          // ✅ FIX: Also try bin-based weight patterns (FCL_Source_bin_21) if we can get bin_id
          const binIdFromTag = tagValues[baseTagName];
          if (binIdFromTag !== undefined && binIdFromTag !== null && binIdFromTag !== 0) {
            const binIdNum = typeof binIdFromTag === 'string' ? parseFloat(binIdFromTag) : Number(binIdFromTag);
            if (!isNaN(binIdNum) && binIdNum > 0) {
              patternVariations.push(
                `FCL_Source_bin_${binIdNum}`,
                `FCL_source_bin_${binIdNum}`,
                `FCL_SOURCE_BIN_${binIdNum}`,
                `FCL_Source_bin_${binIdNum.toString().padStart(2, '0')}`,
                `FCL_source_bin_${binIdNum.toString().padStart(2, '0')}`,
              );
              
              // Also try with converted bin codes (211->21A, 212->21B, 213->21C)
              if (binIdNum === 211) {
                patternVariations.push('FCL_Source_bin_21A', 'FCL_source_bin_21A', 'FCL_SOURCE_BIN_21A');
              } else if (binIdNum === 212) {
                patternVariations.push('FCL_Source_bin_21B', 'FCL_source_bin_21B', 'FCL_SOURCE_BIN_21B');
              } else if (binIdNum === 213) {
                patternVariations.push('FCL_Source_bin_21C', 'FCL_source_bin_21C', 'FCL_SOURCE_BIN_21C');
              }
            }
          }
        }
        if (columnLabel.includes('PRD_CODE') || columnLabel.includes('PRD') || columnLabel.includes('CODE')) {
          patternVariations.push(
            baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, 'PRD_CODE'),
            baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, 'PrdCode'),
            baseTagName.replace(/(FCL_SOURCE_\d+)[_\s]*(BIN_ID|BINID|BinId|bin_id|binid)/i, '$1_PRD_CODE'),
          );
        }
        if (columnLabel.includes('QTY') || columnLabel.includes('PERCENT')) {
          patternVariations.push(
            baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, 'QTY_PERCENT'),
            baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, 'QtyPercent'),
            baseTagName.replace(/(FCL_SOURCE_\d+)[_\s]*(BIN_ID|BINID|BinId|bin_id|binid)/i, '$1_QTY_PERCENT'),
          );
        }
        if (columnLabel.includes('ACTIVE')) {
          patternVariations.push(
            baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, 'ACTIVE'),
            baseTagName.replace(/BIN_ID|BINID|BinId|bin_id|binid/i, 'Active'),
            baseTagName.replace(/(FCL_SOURCE_\d+)[_\s]*(BIN_ID|BINID|BinId|bin_id|binid)/i, '$1_ACTIVE'),
          );
        }
        
        // Remove duplicates and try each pattern variation
        const uniquePatterns = [...new Set(patternVariations)];
        console.log(`[DynamicTableSection] Resolving column "${column.column_label}" (tag: ${columnTagName}) for base tag "${baseTagName}":`, {
          suffix,
          patternsToTry: uniquePatterns.slice(0, 10)
        });
        
        for (const pattern of uniquePatterns) {
          if (pattern !== baseTagName && tagValues[pattern] !== undefined) {
            const value = tagValues[pattern];
            if (value !== null && value !== undefined) {
              console.log(`[DynamicTableSection] ✅ Matched pattern "${pattern}" = ${value}`);
              return value;
            }
          }
          
          // Also try case-insensitive match
          const matchingKey = Object.keys(tagValues).find(k => k.toLowerCase() === pattern.toLowerCase());
          if (matchingKey && matchingKey !== baseTagName && tagValues[matchingKey] !== undefined) {
            const value = tagValues[matchingKey];
            if (value !== null && value !== undefined) {
              console.log(`[DynamicTableSection] ✅ Matched pattern (case-insensitive) "${matchingKey}" = ${value}`);
              return value;
            }
          }
        }
        
        // ✅ FALLBACK: For WEIGHT columns, try to find weight by bin_id number
        if (columnLabel.includes('WEIGHT')) {
          const binIdFromTag = tagValues[baseTagName];
          if (binIdFromTag !== undefined && binIdFromTag !== null && binIdFromTag !== 0) {
            const binIdNum = typeof binIdFromTag === 'string' ? parseFloat(binIdFromTag) : Number(binIdFromTag);
            if (!isNaN(binIdNum) && binIdNum > 0) {
              const binIdStr = binIdNum.toString();
              // Search for any tag that contains the bin_id number and looks like a weight tag
              const matchingWeightTag = Object.keys(tagValues).find(k => {
                const kLower = k.toLowerCase();
                return kLower.includes(binIdStr) && 
                       (kLower.includes('bin') || kLower.includes('source')) &&
                       !kLower.includes('id') && 
                       !kLower.includes('material') &&
                       !kLower.includes('code');
              });
              
              if (matchingWeightTag && tagValues[matchingWeightTag] !== undefined) {
                const value = tagValues[matchingWeightTag];
                if (value !== null && value !== undefined) {
                  console.log(`[DynamicTableSection] ✅ Found weight by bin_id fallback: ${matchingWeightTag} = ${value}`);
                  return value;
                }
              }
            }
          }
        }
        
        console.log(`[DynamicTableSection] ⚠️ No match found for column "${column.column_label}". Tried ${uniquePatterns.length} patterns.`);
        // If no match found, return null (will show as "-")
        return null;
      }
      
      // If column has explicit tag_name (not a pattern), try direct match first
      if (columnTagName && columnTagName !== '{tag_name}') {
        // Try exact match
        if (tagValues[columnTagName] !== undefined) {
          return tagValues[columnTagName];
        }
        // Try case-insensitive match
        const matchingKey = Object.keys(tagValues).find(k => k.toLowerCase() === columnTagName.toLowerCase());
        if (matchingKey) {
          return tagValues[matchingKey];
        }
        
        // If column tag_name is a partial match (e.g., "FCL_SOURCE_BIN_ID" without source number),
        // try to extract source number from baseTagName and complete the pattern
        // Example: baseTagName = "FCL_SOURCE_1_BIN_ID", columnTagName = "FCL_SOURCE_BIN_ID"
        // -> Try "FCL_SOURCE_1_BIN_ID" (already tried), "FCL_SOURCE_1_WEIGHT", etc.
        const sourceNumberMatch = baseTagName.match(/(FCL_SOURCE_)(\d+)(_)/i);
        if (sourceNumberMatch && columnTagName.includes('FCL_SOURCE') && !columnTagName.match(/\d+/)) {
          // Extract the field name from columnTagName (e.g., "BIN_ID", "WEIGHT", "PRD_CODE")
          const fieldMatch = columnTagName.match(/FCL_SOURCE[_\s]*(.+)$/i);
          if (fieldMatch) {
            const fieldName = fieldMatch[1].trim();
            const sourceNumber = sourceNumberMatch[2];
            const completedPatterns = [
              `FCL_SOURCE_${sourceNumber}_${fieldName}`,
              `FCL_SOURCE_${sourceNumber}_${fieldName.toUpperCase()}`,
              `FCL_SOURCE_${sourceNumber}_${fieldName.toLowerCase()}`,
            ];
            
            for (const pattern of completedPatterns) {
              if (tagValues[pattern] !== undefined) {
                console.log(`[DynamicTableSection] ✅ Matched partial tag name "${columnTagName}" -> "${pattern}" = ${tagValues[pattern]}`);
                return tagValues[pattern];
              }
            }
          }
        }
      }
      
      // Try to infer tag value from column label if no explicit tag_name is configured
      // ID column already handled at the top, skip here
      // Extract source number from baseTagName (e.g., "FCL_SOURCE_1_BIN_ID" -> "1")
      const sourceMatch = baseTagName.match(/(FCL_SOURCE_)(\d+)(_)/i);
      
      // ✅ FIX: Get bin_id value from baseTagName for weight lookup
      const binIdValue = tagValues[baseTagName];
      
      if (sourceMatch) {
        const sourceNumber = sourceMatch[2];
        
        // Build potential tag names based on column label
        const inferredPatterns = [];
        
        if (columnLabel.includes('WEIGHT') || columnLabel.includes('QTT') || columnLabel.includes('PRODUCE')) {
          // ✅ FIX: First try source-based patterns (FCL_SOURCE_1_WEIGHT)
          inferredPatterns.push(
            `FCL_SOURCE_${sourceNumber}_WEIGHT`,
            `FCL_SOURCE_${sourceNumber}_Weight`,
            `FCL_source_${sourceNumber}_weight`,
            `FCL_SOURCE_${sourceNumber}_PRODUCED_QTY`,
            `FCL_source_${sourceNumber}_produced_qty`,
          );
          
          // ✅ FIX: Also try bin_id-based patterns (FCL_Source_bin_21) if bin_id is available
          if (binIdValue !== undefined && binIdValue !== null && binIdValue !== 0) {
            const binIdNum = typeof binIdValue === 'string' ? parseFloat(binIdValue) : Number(binIdValue);
            if (!isNaN(binIdNum) && binIdNum > 0) {
              // Try multiple variations for bin-based weight tags
              inferredPatterns.push(
                `FCL_Source_bin_${binIdNum}`,
                `FCL_source_bin_${binIdNum}`,
                `FCL_SOURCE_BIN_${binIdNum}`,
                `FCL_Source_bin_${binIdNum.toString().padStart(2, '0')}`,
                `FCL_source_bin_${binIdNum.toString().padStart(2, '0')}`,
              );
              
              // Also try with converted bin codes (211->21A, 212->21B, 213->21C)
              if (binIdNum === 211) {
                inferredPatterns.push('FCL_Source_bin_21A', 'FCL_source_bin_21A', 'FCL_SOURCE_BIN_21A');
              } else if (binIdNum === 212) {
                inferredPatterns.push('FCL_Source_bin_21B', 'FCL_source_bin_21B', 'FCL_SOURCE_BIN_21B');
              } else if (binIdNum === 213) {
                inferredPatterns.push('FCL_Source_bin_21C', 'FCL_source_bin_21C', 'FCL_SOURCE_BIN_21C');
              }
            }
          }
        }
        if (columnLabel.includes('PRD_CODE') || (columnLabel.includes('PRD') && columnLabel.includes('CODE'))) {
          inferredPatterns.push(
            `FCL_SOURCE_${sourceNumber}_PRD_CODE`,
            `FCL_SOURCE_${sourceNumber}_PrdCode`,
            `FCL_source_${sourceNumber}_prd_code`,
          );
        }
        if (columnLabel.includes('QTY') || columnLabel.includes('PERCENT')) {
          inferredPatterns.push(
            `FCL_SOURCE_${sourceNumber}_QTY_PERCENT`,
            `FCL_SOURCE_${sourceNumber}_QtyPercent`,
            `FCL_source_${sourceNumber}_qty_percent`,
          );
        }
        if (columnLabel.includes('ACTIVE')) {
          inferredPatterns.push(
            `FCL_SOURCE_${sourceNumber}_ACTIVE`,
            `FCL_SOURCE_${sourceNumber}_Active`,
            `FCL_source_${sourceNumber}_active`,
            `FCL_SOURCE_${sourceNumber}_IS_ACTIVE`,
            `FCL_source_${sourceNumber}_is_active`,
          );
        }
        if (columnLabel.includes('VALUES') || columnLabel.includes('VALUE')) {
          // For generic "VALUES" column, try common patterns
          inferredPatterns.push(
            `FCL_SOURCE_${sourceNumber}_WEIGHT`,
            `FCL_SOURCE_${sourceNumber}_QTY_PERCENT`,
            `FCL_SOURCE_${sourceNumber}_PRD_CODE`,
          );
        }
        
        // Try inferred patterns (with case-insensitive fallback)
        for (const pattern of inferredPatterns) {
          // Try exact match first
          if (tagValues[pattern] !== undefined) {
            const value = tagValues[pattern];
            // Only return if value is not null/undefined (0 is valid)
            if (value !== null && value !== undefined) {
              console.log(`[DynamicTableSection] ✅ Inferred tag value from column label "${column.column_label}": ${pattern} = ${value}`);
              return value;
            }
          }
          
          // Try case-insensitive match
          const matchingKey = Object.keys(tagValues).find(k => k.toLowerCase() === pattern.toLowerCase());
          if (matchingKey && tagValues[matchingKey] !== undefined) {
            const value = tagValues[matchingKey];
            if (value !== null && value !== undefined) {
              console.log(`[DynamicTableSection] ✅ Inferred tag value (case-insensitive) from column label "${column.column_label}": ${matchingKey} = ${value}`);
              return value;
            }
          }
        }
        
        // ✅ FALLBACK: If no match found, try to find weight tag by bin_id number in tag name
        if (columnLabel.includes('WEIGHT') && binIdValue !== undefined && binIdValue !== null && binIdValue !== 0) {
          const binIdNum = typeof binIdValue === 'string' ? parseFloat(binIdValue) : Number(binIdValue);
          if (!isNaN(binIdNum) && binIdNum > 0) {
            // Search for any tag that contains the bin_id number and looks like a weight tag
            const binIdStr = binIdNum.toString();
            const matchingWeightTag = Object.keys(tagValues).find(k => {
              const kLower = k.toLowerCase();
              // Must contain the bin_id number and look like a weight tag (contains "bin" but not "id" or "material")
              return kLower.includes(binIdStr) && 
                     (kLower.includes('bin') || kLower.includes('source')) &&
                     !kLower.includes('id') && 
                     !kLower.includes('material') &&
                     !kLower.includes('code');
            });
            
            if (matchingWeightTag && tagValues[matchingWeightTag] !== undefined) {
              const value = tagValues[matchingWeightTag];
              if (value !== null && value !== undefined) {
                console.log(`[DynamicTableSection] ✅ Found weight tag by bin_id fallback: ${matchingWeightTag} = ${value}`);
                return value;
              }
            }
          }
        }
        
        // If still no match found for WEIGHT, log available tags for debugging
        if (columnLabel.includes('WEIGHT') && inferredPatterns.length > 0) {
          const weightTags = Object.keys(tagValues).filter(k => 
            k.toLowerCase().includes('weight') || 
            (k.toLowerCase().includes('bin') && !k.toLowerCase().includes('id') && !k.toLowerCase().includes('material'))
          );
          console.log(`[DynamicTableSection] ⚠️ No weight tag found for "${column.column_label}". Tried patterns:`, inferredPatterns.slice(0, 10));
          console.log(`[DynamicTableSection] Available weight-related tags:`, weightTags.slice(0, 20));
          console.log(`[DynamicTableSection] baseTagName: ${baseTagName}, binIdValue: ${binIdValue}`);
        }
      }
      
      // Final fallback: ID column already handled at the top
      // For all other columns, return null (will show as "-") if no match found
      console.log(`[DynamicTableSection] ⚠️ No value found for column "${column.column_label}" (baseTag: ${baseTagName}). Returning null.`);
      return null;
    }
  };

  const getCellUnit = (column, row, isDynamic) => {
    if (!isDynamic) {
      // For static rows: get unit from row's cell configuration
      const cellConfig = (row.cells || []).find(c => c.column_id === column.id);
      // Only show unit if displaying value (not name)
      const displayType = cellConfig?.display_type || 'value';
      if (displayType === 'name') {
        return ''; // No unit when showing tag name
      }
      return cellConfig?.unit || '';
    } else {
      // For dynamic rows: use column unit or tag unit
      return column.unit || '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <FaSpinner className="animate-spin text-brand" />
      </div>
    );
  }

  // Debug logging
  console.log('[DynamicTableSection] Received section:', {
    sectionName: section.section_name,
    columnsCount: section.columns?.length || 0,
    columns: section.columns,
    tableConfig: section.table_config
  });

  if (!section.columns || section.columns.length === 0) {
    console.warn('[DynamicTableSection] No columns found for section:', section.section_name);
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No columns configured for this table section.
      </div>
    );
  }

  const sortedColumns = [...section.columns].sort((a, b) => 
    (a.display_order || 0) - (b.display_order || 0)
  );

  // Separate heading columns from data columns
  // Columns without column_type default to 'data' (backward compatibility)
  const headingColumns = sortedColumns.filter(col => col.column_type === 'heading');
  const dataColumns = sortedColumns.filter(col => {
    // If column_type is undefined/null, treat as data column
    return col.column_type !== 'heading';
  });
  
  // Debug: Log column separation
  console.log('[DynamicTableSection] Column separation:', {
    totalColumns: sortedColumns.length,
    headingColumnsCount: headingColumns.length,
    dataColumnsCount: dataColumns.length,
    headingColumns: headingColumns.map(c => c.column_label),
    dataColumns: dataColumns.map(c => c.column_label),
    allColumns: sortedColumns.map(c => ({ label: c.column_label, type: c.column_type || 'data (default)' }))
  });

  const rowMode = section.table_config?.row_mode || 'static';
  const isDynamic = rowMode === 'dynamic' || rowMode === 'Dynamic';

  // Automatic Tag Value Detection from Available Values
  const autoDetectMatchingTags = (groupTags, availableTagValues) => {
    if (!availableTagValues) {
      return [];
    }
    
    // If groupTags is empty, try to auto-detect tags directly from available values
    if (!groupTags || groupTags.length === 0) {
      console.log('[DynamicTableSection] Tag group is empty, attempting to auto-detect tags from available values...');
      return autoDetectTagsFromValues(availableTagValues);
    }

    const matchedTags = [];
    const availableKeys = Object.keys(availableTagValues);
    
    for (const groupTag of groupTags) {
      const tagName = groupTag.tag_name;
      if (!tagName) continue;
      
      // Try exact match first
      if (availableTagValues[tagName] !== undefined) {
        matchedTags.push({ ...groupTag, matchedKey: tagName });
        continue;
      }
      
      // Try case-insensitive match
      const caseInsensitiveMatch = availableKeys.find(k => k.toLowerCase() === tagName.toLowerCase());
      if (caseInsensitiveMatch) {
        matchedTags.push({ ...groupTag, matchedKey: caseInsensitiveMatch });
        continue;
      }
      
      // Try partial matching (e.g., "FCL_SOURCE_1_BIN_ID" matches "FCL_source_1_bin_id")
      const tagNameLower = tagName.toLowerCase();
      const tagNameParts = tagNameLower.split(/[_\s-]+/).filter(p => p.length > 0);
      
      // ✅ FIX: Check if this is a bin_id tag - if so, only match to other bin_id tags, not weight tags
      const isBinIdTag = tagNameLower.includes('bin_id') || tagNameLower.includes('binid') || 
                         (tagNameLower.includes('bin') && tagNameLower.includes('id'));
      
      if (tagNameParts.length > 0) {
        const partialMatch = availableKeys.find(key => {
          const keyLower = key.toLowerCase();
          
          // ✅ FIX: For bin_id tags, only match to other bin_id tags (not weight tags like FCL_Source_bin_21)
          if (isBinIdTag) {
            const isKeyBinIdTag = keyLower.includes('bin_id') || keyLower.includes('binid') || 
                                  (keyLower.includes('bin') && keyLower.includes('id') && !keyLower.match(/bin[_\s]*\d+[A-C]?$/));
            if (!isKeyBinIdTag) {
              return false; // Don't match bin_id tags to weight tags
            }
          }
          
          // Check if all parts of tag name are in the key
          return tagNameParts.every(part => keyLower.includes(part));
        });
        
        if (partialMatch) {
          matchedTags.push({ ...groupTag, matchedKey: partialMatch });
          continue;
        }
      }
      
      // Try pattern-based matching for FCL sources
      // If tag group has "FCL_SOURCE_1_BIN_ID", try to find "FCL_SOURCE_1_BIN_ID" in available values
      const sourceMatch = tagName.match(/(FCL_SOURCE_)(\d+)(_)/i);
      if (sourceMatch) {
        const sourceNumber = sourceMatch[2];
        const fieldName = tagName.replace(/FCL_SOURCE_\d+_/i, '');
        
        // Try multiple variations
        const variations = [
          `FCL_SOURCE_${sourceNumber}_${fieldName}`,
          `FCL_source_${sourceNumber}_${fieldName.toLowerCase()}`,
          `FCL_SOURCE_${sourceNumber}_${fieldName.toUpperCase()}`,
        ];
        
        for (const variation of variations) {
          if (availableTagValues[variation] !== undefined) {
            matchedTags.push({ ...groupTag, matchedKey: variation });
            break;
          }
        }
      }
    }
    
    console.log(`[DynamicTableSection] Auto-detected ${matchedTags.length} matching tags from ${groupTags.length} group tags`);
    return matchedTags;
  };

  // Auto-detect tags directly from available tag values (fallback when tag group is empty)
  const autoDetectTagsFromValues = (availableTagValues) => {
    if (!availableTagValues) {
      return [];
    }

    const detectedTags = [];
    const availableKeys = Object.keys(availableTagValues);
    
    // ✅ FIX: Only look for bin_id tags, not weight tags
    // Look for FCL source patterns (e.g., FCL_SOURCE_1_BIN_ID, FCL_SOURCE_2_BIN_ID)
    const fclSourcePattern = /FCL_SOURCE[_\s]*(\d+)[_\s]*BIN[_\s]*ID/i;
    const sourceNumbers = new Set();
    
    // Extract all source numbers from available tag keys (only bin_id tags, not weight tags)
    availableKeys.forEach(key => {
      const keyLower = key.toLowerCase();
      // ✅ FIX: Only match bin_id tags, exclude weight tags (like FCL_Source_bin_21)
      const isWeightTag = keyLower.includes('bin') && 
                         !keyLower.includes('id') && 
                         !keyLower.includes('code') &&
                         keyLower.match(/bin[_\s]*\d+[A-C]?$/);
      
      if (isWeightTag) {
        return; // Skip weight tags
      }
      
      const match = key.match(fclSourcePattern);
      if (match) {
        sourceNumbers.add(match[1]);
      }
    });
    
    // Also try case variations (only for bin_id tags)
    if (sourceNumbers.size === 0) {
      availableKeys.forEach(key => {
        const keyLower = key.toLowerCase();
        // ✅ FIX: Only match bin_id tags, exclude weight tags
        const isWeightTag = keyLower.includes('bin') && 
                           !keyLower.includes('id') && 
                           !keyLower.includes('code') &&
                           keyLower.match(/bin[_\s]*\d+[A-C]?$/);
        
        if (isWeightTag) {
          return; // Skip weight tags
        }
        
        if (keyLower.includes('fcl') && keyLower.includes('source') && keyLower.includes('bin') && keyLower.includes('id')) {
          // Try to extract source number
          const numMatch = key.match(/(\d+)/);
          if (numMatch) {
            sourceNumbers.add(numMatch[1]);
          }
        }
      });
    }
    
    console.log(`[DynamicTableSection] Detected ${sourceNumbers.size} FCL sources from available tag values:`, Array.from(sourceNumbers));
    
    // Create virtual tag objects for each detected source
    sourceNumbers.forEach(sourceNum => {
      // Try to find the bin_id tag for this source
      const binIdPatterns = [
        `FCL_SOURCE_${sourceNum}_BIN_ID`,
        `FCL_source_${sourceNum}_bin_id`,
        `FCL_SOURCE_${sourceNum}_BINID`,
        `FCL_source_${sourceNum}_binid`,
        `FCL_Source_${sourceNum}_BinId`,
      ];
      
      let binIdKey = null;
      let binIdValue = null;
      
      for (const pattern of binIdPatterns) {
        if (availableTagValues[pattern] !== undefined) {
          binIdKey = pattern;
          binIdValue = availableTagValues[pattern];
          break;
        }
      }
      
      // Also try case-insensitive search
      if (!binIdKey) {
        const matchingKey = availableKeys.find(k => {
          const kLower = k.toLowerCase();
          return kLower.includes(`fcl`) && 
                 kLower.includes(`source`) && 
                 kLower.includes(sourceNum) && 
                 (kLower.includes('bin_id') || kLower.includes('binid'));
        });
        
        if (matchingKey) {
          binIdKey = matchingKey;
          binIdValue = availableTagValues[matchingKey];
        }
      }
      
      // Only create tag if bin_id is found and has a non-zero value
      if (binIdKey && binIdValue !== undefined) {
        const binValueNum = typeof binIdValue === 'string' ? parseFloat(binIdValue) : Number(binIdValue);
        
        // Filter out inactive bins (value = 0)
        if (binValueNum !== 0 && !isNaN(binValueNum) && binValueNum !== null) {
          detectedTags.push({
            id: `auto_${sourceNum}`,
            tag_name: binIdKey,
            display_name: `FCL Source ${sourceNum} Bin ID`,
            matchedKey: binIdKey,
            is_active: true,
            source_type: 'PLC',
            data_type: 'INT',
            unit: '',
            // Store source number for reference
            source_number: sourceNum
          });
          
          console.log(`[DynamicTableSection] ✅ Auto-detected active source ${sourceNum} with bin_id=${binIdValue} (key: ${binIdKey})`);
        }
      }
    });
    
    console.log(`[DynamicTableSection] Auto-detected ${detectedTags.length} tags directly from available values`);
    return detectedTags;
  };

  // Debug logging before filtering
  const allTagValueKeys = Object.keys(tagValues);
  const fclRelatedKeys = allTagValueKeys.filter(k => k.toLowerCase().includes('fcl') || k.toLowerCase().includes('source'));
  const binRelatedKeys = allTagValueKeys.filter(k => k.toLowerCase().includes('bin'));
  
  // Auto-detect matching tags from available tag values
  const autoDetectedTags = autoDetectMatchingTags(groupTags, tagValues);
  
  console.log('[DynamicTableSection] Filtering rows:', {
    isDynamic,
    groupTagsCount: groupTags.length,
    autoDetectedCount: autoDetectedTags.length,
    tagValuesCount: allTagValueKeys.length,
    groupTagNames: groupTags.map(t => t.tag_name),
    allTagValueKeys: allTagValueKeys,
    fclRelatedKeys: fclRelatedKeys,
    binRelatedKeys: binRelatedKeys,
    matchedTags: autoDetectedTags.map(t => ({ groupTag: t.tag_name, matchedKey: t.matchedKey })),
    sampleTagValues: Object.entries(tagValues).slice(0, 10),
    tagGroupName: section.table_config?.tag_group,
    tagGroupId: section.table_config?.tag_group_id
  });

  // For dynamic rows, use tags from tag group (with auto-detection fallback)
  // For static rows, use configured static rows
  // Use auto-detected tags if available, otherwise use groupTags
  // If both are empty but we have tag values, try direct detection
  let tagsToUse = autoDetectedTags.length > 0 ? autoDetectedTags : groupTags.map(t => ({ ...t, matchedKey: t.tag_name }));
  
  // Final fallback: if tag group is empty and auto-detection found nothing, try direct detection from values
  if (isDynamic && tagsToUse.length === 0 && Object.keys(tagValues).length > 0) {
    console.log('[DynamicTableSection] Tag group and auto-detection both empty, trying direct detection from tag values...');
    const directDetected = autoDetectTagsFromValues(tagValues);
    if (directDetected.length > 0) {
      tagsToUse = directDetected;
      console.log(`[DynamicTableSection] ✅ Direct detection found ${directDetected.length} tags from available values`);
    }
  }
  
  // ✅ FIX: Helper functions for deduplication and weight filtering
  const getBinIdFromRow = (row) => {
    const rowTagName = row.tag_name || row.matchedKey || '';
    const rowTagValue = tagValues[rowTagName];
    let binId = rowTagValue !== undefined && rowTagValue !== null ? 
                (typeof rowTagValue === 'string' ? parseFloat(rowTagValue) : Number(rowTagValue)) : null;
    
    if (!binId || isNaN(binId)) {
      const binIdMatch = rowTagName.match(/bin[_\s]*(\d+[A-C]?)/i);
      if (binIdMatch) {
        const binIdStr = binIdMatch[1];
        if (binIdStr.endsWith('A')) {
          binId = parseInt(binIdStr.slice(0, -1)) * 10 + 1;
        } else if (binIdStr.endsWith('B')) {
          binId = parseInt(binIdStr.slice(0, -1)) * 10 + 2;
        } else if (binIdStr.endsWith('C')) {
          binId = parseInt(binIdStr.slice(0, -1)) * 10 + 3;
        } else {
          binId = parseInt(binIdStr);
        }
      }
    }
    return binId && !isNaN(binId) ? binId : null;
  };
  
  const getWeightForBin = (binId) => {
    if (!binId || isNaN(binId)) {
      console.log(`[getWeightForBin] Invalid binId: ${binId}`);
      return null;
    }
    
    const binIdNum = Number(binId);
    const binIdStr = binIdNum.toString();
    
    console.log(`[getWeightForBin] Looking for weight for bin_id=${binIdNum}`);
    
    // Try multiple weight tag patterns
    const weightPatterns = [
      `FCL_Source_bin_${binIdNum}`,
      `FCL_source_bin_${binIdNum}`,
      `FCL_SOURCE_BIN_${binIdNum}`,
      `FCL_Source_bin_${binIdStr.padStart(2, '0')}`,
      `FCL_source_bin_${binIdStr.padStart(2, '0')}`,
    ];
    
    // Also try with converted bin codes (211->21A, 212->21B, 213->21C)
    if (binIdNum === 211) {
      weightPatterns.push('FCL_Source_bin_21A', 'FCL_source_bin_21A', 'FCL_SOURCE_BIN_21A');
    } else if (binIdNum === 212) {
      weightPatterns.push('FCL_Source_bin_21B', 'FCL_source_bin_21B', 'FCL_SOURCE_BIN_21B');
    } else if (binIdNum === 213) {
      weightPatterns.push('FCL_Source_bin_21C', 'FCL_source_bin_21C', 'FCL_SOURCE_BIN_21C');
    }
    
    console.log(`[getWeightForBin] Trying ${weightPatterns.length} patterns for bin ${binIdNum}:`, weightPatterns.slice(0, 5));
    
    // Try exact match first
    for (const pattern of weightPatterns) {
      if (tagValues[pattern] !== undefined && tagValues[pattern] !== null) {
        const weight = typeof tagValues[pattern] === 'string' ? parseFloat(tagValues[pattern]) : Number(tagValues[pattern]);
        if (!isNaN(weight)) {
          console.log(`[getWeightForBin] ✅ Found weight for bin ${binIdNum} using pattern "${pattern}": ${weight}`);
          return weight;
        }
      }
    }
    
    // Try case-insensitive match
    const binIdStrLower = binIdStr.toLowerCase();
    const matchingKey = Object.keys(tagValues).find(k => {
      const kLower = k.toLowerCase();
      return kLower.includes(binIdStrLower) && 
             (kLower.includes('bin') || kLower.includes('source')) &&
             !kLower.includes('id') && 
             !kLower.includes('material') &&
             !kLower.includes('code');
    });
    
    if (matchingKey && tagValues[matchingKey] !== undefined && tagValues[matchingKey] !== null) {
      const weight = typeof tagValues[matchingKey] === 'string' ? parseFloat(tagValues[matchingKey]) : Number(tagValues[matchingKey]);
      if (!isNaN(weight)) {
        console.log(`[getWeightForBin] ✅ Found weight for bin ${binIdNum} using case-insensitive match "${matchingKey}": ${weight}`);
        return weight;
      }
    }
    
    // ✅ FIX: Also try to find any tag that contains the bin number (more flexible matching)
    const allMatchingKeys = Object.keys(tagValues).filter(k => {
      const kLower = k.toLowerCase();
      // Must contain the bin number and look like a weight tag
      return kLower.includes(binIdStrLower) && 
             (kLower.includes('bin') || kLower.includes('source')) &&
             !kLower.includes('id') && 
             !kLower.includes('material') &&
             !kLower.includes('code') &&
             !kLower.includes('active');
    });
    
    if (allMatchingKeys.length > 0) {
      console.log(`[getWeightForBin] Found ${allMatchingKeys.length} potential weight tag(s) for bin ${binIdNum}:`, allMatchingKeys);
      // Try the first matching key
      const firstMatch = allMatchingKeys[0];
      const weight = typeof tagValues[firstMatch] === 'string' ? parseFloat(tagValues[firstMatch]) : Number(tagValues[firstMatch]);
      if (!isNaN(weight) && weight !== null && weight !== undefined) {
        console.log(`[getWeightForBin] ✅ Found weight for bin ${binIdNum} using flexible match "${firstMatch}": ${weight}`);
        return weight;
      }
    }
    
    console.log(`[getWeightForBin] ⚠️ No weight found for bin ${binIdNum}. Available tag keys containing "${binIdStr}":`, 
      Object.keys(tagValues).filter(k => k.toLowerCase().includes(binIdStrLower)).slice(0, 10));
    return null;
  };
  
  let rows = isDynamic && tagsToUse.length > 0
    ? tagsToUse.filter(t => {
        // Filter by is_active flag
        if (t.is_active === false) return false;
        
        // ✅ FIX: Only allow bin_id tags to create rows, not weight tags
        const tagName = t.tag_name || '';
        const tagNameLower = tagName.toLowerCase();
        const isBinIdTag = tagNameLower.includes('bin_id') || 
                          tagNameLower.includes('binid') ||
                          (tagNameLower.includes('bin') && tagNameLower.includes('id') && !tagNameLower.match(/bin[_\s]*\d+[A-C]?$/));
        
        // Check if it's a weight tag (contains "bin" but ends with a number, like "FCL_Source_bin_21")
        const isWeightTag = tagNameLower.includes('bin') && 
                           !tagNameLower.includes('id') && 
                           !tagNameLower.includes('code') &&
                           tagNameLower.match(/bin[_\s]*\d+[A-C]?$/);
        
        // Reject weight tags - only bin_id tags should create rows
        if (isWeightTag) {
          console.log(`[DynamicTableSection] ⚠️ Filtering out weight tag "${tagName}" - only bin_id tags should create rows`);
          return false;
        }
        
        // Get the actual tag value using matchedKey (from auto-detection) or tag_name
        const tagKey = t.matchedKey || t.tag_name;
        const tagValue = tagValues[tagKey];
        
        // ✅ NEW: For bin tags, filter out inactive bins (value = 0)
        // Check if this tag represents a bin (by naming convention)
        const isBinTag = isBinIdTag;
        
        if (isBinTag) {
          // If tag value not found yet, don't filter out (might be loading)
          if (tagValue === undefined) {
            console.log(`[DynamicTableSection] Tag value not found for ${tagName} (key: ${tagKey}). Available keys:`, Object.keys(tagValues).filter(k => k.toLowerCase().includes('fcl') || k.toLowerCase().includes('source')).slice(0, 10));
            return true; // Keep row if value not loaded yet
          }
          
          // Convert to number for comparison (handle both string and number)
          const binValueNum = typeof tagValue === 'string' ? parseFloat(tagValue) : Number(tagValue);
          
          // Filter out inactive bins (value = 0 or null/undefined or NaN)
          if (binValueNum === 0 || binValueNum === null || binValueNum === undefined || isNaN(binValueNum)) {
            console.log(`[DynamicTableSection] Filtering out inactive bin tag: ${tagName} (matched key: ${tagKey}, value=${tagValue}, numeric=${binValueNum})`);
            return false;
          }
          
          console.log(`[DynamicTableSection] ✅ Keeping active bin tag: ${tagName} (matched key: ${tagKey}, value=${tagValue}, numeric=${binValueNum})`);
          
          // ✅ FIX: Don't filter by weight here - let all active bins show, weight column will handle display
          // The weight filter was too strict and was filtering out valid bins
          // Instead, show all active bins and let the weight column resolve weights (or show 0 if not found)
          console.log(`[DynamicTableSection] ✅ Keeping active bin ${binValueNum} (weight will be resolved in column)`);
        }
        
        return true;
      }).map(t => {
        // ✅ FIX: For bin_id tags, always use the original tag_name (not matchedKey) as the base
        // This ensures ID column shows bin_id value, not weight value
        const isBinIdTag = (t.tag_name || '').toLowerCase().includes('bin_id') || 
                          (t.tag_name || '').toLowerCase().includes('binid') ||
                          ((t.tag_name || '').toLowerCase().includes('bin') && (t.tag_name || '').toLowerCase().includes('id'));
        
        return {
          ...t,
          // For bin_id tags, use original tag_name; for others, use matchedKey if available
          tag_name: isBinIdTag ? (t.tag_name || t.matchedKey) : (t.matchedKey || t.tag_name),
          // Store matchedKey separately for pattern matching in getCellValue
          matchedKey: t.matchedKey || t.tag_name
        };
      })
    : (!isDynamic && section.table_config?.static_rows)
    ? section.table_config.static_rows.filter(row => {
        // ✅ NEW: For static rows with bin tags, also filter inactive bins
        if (row.cells && Array.isArray(row.cells)) {
          for (const cell of row.cells) {
            if (cell.tag_name) {
              const tagName = cell.tag_name;
              const isBinTag = tagName.toLowerCase().includes('binid') || 
                               tagName.toLowerCase().includes('bin_id') ||
                               (tagName.toLowerCase().includes('bin') && tagName.toLowerCase().includes('id'));
              
              if (isBinTag) {
                // Try multiple tag name variations
                const tagNameVariations = [
                  tagName,
                  tagName.toLowerCase(),
                  tagName.toUpperCase(),
                ];
                
                let binValue = null;
                for (const variation of tagNameVariations) {
                  if (tagValues[variation] !== undefined) {
                    binValue = tagValues[variation];
                    break;
                  }
                }
                
                // If tag value not found yet, don't filter out
                if (binValue === undefined) {
                  return true; // Keep row if value not loaded yet
                }
                
                // Convert to number for comparison
                const binValueNum = typeof binValue === 'string' ? parseFloat(binValue) : Number(binValue);
                
                // Filter out rows where bin is inactive
                if (binValueNum === 0 || binValueNum === null || binValueNum === undefined || isNaN(binValueNum)) {
                  console.log(`[DynamicTableSection] Filtering out static row with inactive bin: ${tagName} (value=${binValue}, numeric=${binValueNum})`);
                  return false;
                }
              }
            }
          }
        }
        return true;
      })
    : [];
  
  // ✅ FIX: Apply deduplication and weight-based filtering for dynamic rows
  if (isDynamic && rows.length > 0) {
    // Deduplicate rows by bin_id
    const uniqueRowsMap = new Map();
    
    rows.forEach((row, index) => {
      const binId = getBinIdFromRow(row);
      
      if (binId) {
        const existingRow = uniqueRowsMap.get(binId);
        if (!existingRow) {
          // First occurrence of this bin_id
          uniqueRowsMap.set(binId, row);
        } else {
          // Prefer bin_id tags over weight tags for row creation
          const existingRowTagName = existingRow.tag_name || existingRow.matchedKey || '';
          const currentRowTagName = row.tag_name || row.matchedKey || '';
          
          const existingIsBinIdTag = existingRowTagName.toLowerCase().includes('bin_id') || existingRowTagName.toLowerCase().includes('binid');
          const currentIsBinIdTag = currentRowTagName.toLowerCase().includes('bin_id') || currentRowTagName.toLowerCase().includes('binid');
          
          if (currentIsBinIdTag && !existingIsBinIdTag) {
            // Current is bin_id tag, existing is not - prefer current
            uniqueRowsMap.set(binId, row);
          }
          // Otherwise keep existing (first occurrence)
        }
      } else {
        // No bin_id, keep the row (might be a static row)
        uniqueRowsMap.set(`no_bin_${index}`, row);
      }
    });
    
    // Convert map back to array
    let uniqueRows = Array.from(uniqueRowsMap.values());
    
    // Filter out inactive bins (weight = 0 or null/undefined)
    uniqueRows = uniqueRows.filter(row => {
      const binId = getBinIdFromRow(row);
      
      if (!binId) {
        // No bin_id - keep it (might be a static row)
        return true;
      }
      
      const weight = getWeightForBin(binId);
      
      // Filter out bins with weight = 0 or null/undefined
      if (weight === null || weight === undefined || weight === 0 || isNaN(weight)) {
        console.log(`[DynamicTableSection] ⚠️ Filtering out inactive bin ${binId} (weight=${weight})`);
        return false;
      }
      
      console.log(`[DynamicTableSection] ✅ Keeping active bin ${binId} (weight=${weight})`);
      return true;
    });
    
    // Update rows variable
    rows = uniqueRows;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        {/* Show column headers FIRST (before heading rows) */}
        {showHeader && (dataColumns.length > 0 || sortedColumns.length > 0) && (
        <thead>
          <tr className="bg-gray-100 dark:!bg-[#0b111e]">
              {/* If we have data columns, show them. Otherwise show all columns (backward compatibility) */}
              {(dataColumns.length > 0 ? dataColumns : sortedColumns).map((column) => {
                // Normalize alignment: handle case variations and ensure valid value
                let alignment = (column.alignment || '').toLowerCase();
                if (!['left', 'center', 'right'].includes(alignment)) {
                  // Fallback: default to 'right' for numeric columns, 'left' otherwise
                  alignment = (column.column_label && 
                    (column.column_label.toUpperCase().includes('WT') || 
                     column.column_label.toUpperCase().includes('WEIGHT') ||
                     column.column_label.toUpperCase().includes('VALUE') ||
                     column.column_label.toUpperCase().includes('PERCENT') ||
                     column.column_label.toUpperCase().includes('%')))
                    ? 'right' : 'left';
                }
                
                // Set padding classes based on alignment
                // Left: more spacing from left side, less from right
                // Right: more spacing from right side, less from left
                // Center: equal spacing on both sides
                const paddingClass = alignment === 'right' 
                  ? 'pl-4 pr-8'  // Less left padding, more right padding - spacing from right side
                  : alignment === 'center'
                  ? 'px-8'       // Equal padding on both sides - content exactly centered
                  : 'pl-8 pr-4'; // More left padding, less right padding - spacing from left side
                
                // Set text alignment class
                const textAlignClass = alignment === 'right' 
                  ? 'text-right' 
                  : alignment === 'center'
                  ? 'text-center'
                  : 'text-left';
                
                return (
              <th
                key={column.id}
                    className={`${paddingClass} ${textAlignClass} py-3 text-base font-medium text-gray-700 dark:text-gray-300 uppercase border-b border-gray-200 dark:border-gray-700`}
                style={{
                  width: column.width ? `${column.width}px` : 'auto',
                  textAlign: alignment // Inline style as fallback to ensure proper alignment
                }}
              >
                {column.column_label}
              </th>
                );
              })}
          </tr>
        </thead>
        )}
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {/* Render heading columns as rows AFTER the header, in tbody */}
          {headingColumns.map((headingCol, headingIdx) => {
            const colspan = dataColumns.length > 0 ? dataColumns.length : sortedColumns.length || 1;
            return (
              <tr
                key={`heading-${headingCol.id}`}
                className="bg-blue-50 dark:bg-blue-900/20 border-b-2 border-blue-200 dark:border-blue-700"
              >
                <td
                  colSpan={colspan}
                  className="px-4 py-3 text-lg font-bold text-blue-700 dark:text-blue-300"
                  style={{ textAlign: 'left' }}
                >
                  {headingCol.column_label || 'Heading'}
                </td>
              </tr>
            );
          })}
          
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={dataColumns.length || 1}
                className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
              >
                {isDynamic 
                  ? 'No tags in group or no active tags found.'
                  : 'No static rows configured. Please add rows in the section configuration.'}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => {
              // For dynamic: row is a tag object, for static: row is a row config object
              const rowKey = isDynamic ? row.id : (row.id || idx);
              
              // Check if this is a heading row (only for static rows)
              // Default to 'data' if row_type is not set (backward compatibility)
              const isHeading = !isDynamic && (row.row_type === 'heading');
              
              // If it's a heading row, render it as a single cell spanning all columns (styled consistently with other tables)
              if (isHeading) {
                const colspan = dataColumns.length > 0 ? dataColumns.length : sortedColumns.length || 1;
                return (
                  <tr
                    key={rowKey}
                    className="bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600"
                  >
                    <td
                      colSpan={colspan}
                      className="px-4 py-3 text-lg font-bold text-gray-900 dark:text-gray-100 uppercase"
                      style={{ textAlign: 'left' }}
                    >
                      {row.row_label || 'Heading'}
                    </td>
                  </tr>
                );
              }
              
              return (
                <tr
                  key={rowKey}
                  className="hover:bg-gray-50 dark:hover:bg-[#0b111e] transition-colors"
                >
                  {/* Use dataColumns if available, otherwise use all columns (backward compatibility) */}
                  {(dataColumns.length > 0 ? dataColumns : sortedColumns).map((column) => {
                    const value = getCellValue(column, row, isDynamic);
                    const unit = getCellUnit(column, row, isDynamic);
                    const cellConfig = !isDynamic ? (row.cells || []).find(c => c.column_id === column.id) : null;
                    const displayAsCheckbox = cellConfig?.display_as_checkbox || false;
                    
                    // Normalize alignment: handle case variations and ensure valid value
                    let alignment = (column.alignment || '').toLowerCase();
                    if (!['left', 'center', 'right'].includes(alignment)) {
                      // Fallback: default to 'right' for numeric columns, 'left' otherwise
                      alignment = (column.column_label && 
                        (column.column_label.toUpperCase().includes('WT') || 
                         column.column_label.toUpperCase().includes('WEIGHT') ||
                         column.column_label.toUpperCase().includes('VALUE') ||
                         column.column_label.toUpperCase().includes('PERCENT') ||
                         column.column_label.toUpperCase().includes('%')))
                        ? 'right' : 'left';
                    }
                    
                    // Set padding classes based on alignment
                    // Left: more spacing from left side, less from right
                    // Right: more spacing from right side, less from left
                    // Center: equal spacing on both sides
                    const paddingClass = alignment === 'right' 
                      ? 'pl-4 pr-8'  // Less left padding, more right padding - spacing from right side
                      : alignment === 'center'
                      ? 'px-8'       // Equal padding on both sides - content exactly centered
                      : 'pl-8 pr-4'; // More left padding, less right padding - spacing from left side
                    
                    // Set text alignment class
                    const textAlignClass = alignment === 'right' 
                      ? 'text-right' 
                      : alignment === 'center'
                      ? 'text-center'
                      : 'text-left';
                    
                    return (
                      <td
                        key={column.id}
                        className={`${paddingClass} ${textAlignClass} py-3 text-base text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700`}
                        style={{
                          textAlign: alignment // Inline style as fallback to ensure proper alignment
                        }}
                      >
                         {displayAsCheckbox ? (
                           <div className={alignment === 'right' ? 'flex justify-end' : alignment === 'center' ? 'flex justify-center' : 'flex justify-start'}>
                           {/* Custom checkbox for better browser compatibility */}
                           <div
                             className="inline-flex items-center justify-center w-4 h-4 border-2 rounded cursor-not-allowed"
                             style={{
                               backgroundColor: (value === 1 || value === true || value === '1') ? 'var(--brand)' : 'transparent',
                               borderColor: (value === 1 || value === true || value === '1') ? 'var(--brand)' : '#d1d5db',
                               minWidth: '1rem',
                               minHeight: '1rem'
                             }}
                           >
                             {(value === 1 || value === true || value === '1') && (
                               <FaCheck className="text-white" size={10} />
                             )}
                           </div>
                           </div>
                         ) : (
                          (() => {
                            // Determine decimals: use cell config decimals, or column decimals, or default based on column type
                            let decimals = cellConfig?.decimals;
                            if (decimals === undefined) {
                              decimals = column.decimals;
                            }
                            // For BIN_ID columns, always show as integer (0 decimals)
                            if (column.column_label && (column.column_label.toUpperCase().includes('BIN_ID') || column.column_label.toUpperCase().includes('BINID'))) {
                              decimals = 0;
                            }
                            return formatValue(value, decimals, unit);
                          })()
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DynamicTableSection;

