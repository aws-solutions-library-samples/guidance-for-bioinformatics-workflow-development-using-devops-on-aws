params.outdir = 'results'

include { INDEX } from './index'
include { QUANT } from './quant'
include { FASTQC } from './fastqc'

workflow RNASEQ {
  take:
    transcriptome
    sample_id
    read1
    read2
 
  main: 
    INDEX(transcriptome)
    FASTQC(read1, read2, sample_id)
    QUANT(INDEX.out, read1, read2, sample_id)

  emit: 
    QUANT.out | concat(FASTQC.out) | collect
}
