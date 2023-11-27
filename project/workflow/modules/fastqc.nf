params.outdir = 'results'

process FASTQC {
    tag "FASTQC on $sample_id"
    container 'quay.io/nextflow/rnaseq-nf:v1.1'
    publishDir params.outdir, mode:'copy'

    input:
    path reads1
    path reads2
    val sample_id 

    output:
    path "fastqc_${sample_id}_logs" 

    script:
    """
    echo "Running fastqc"
    fastqc "$sample_id" "$reads1 $reads2"
    echo "Command done"
    ls -Rl && sleep 60
    """
}
